const crypto = require('crypto');
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

/**
 * AES-256-GCM Encryption / Decryption Helpers
 * Shared with platform credential format (nonce_hex:ciphertext_hex)
 */
const getAesKey = () => {
  const keyStr = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  if (keyStr.length === 64) {
    try {
      return Buffer.from(keyStr, 'hex');
    } catch (e) {
      // Fallback
    }
  }
  return Buffer.from(keyStr.padEnd(32, '\0').slice(0, 32));
};

const encryptData = (data) => {
  try {
    const key = getAesKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const jsonStr = JSON.stringify(data, BufferJSON.replacer);
    const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ciphertextWithTag = Buffer.concat([encrypted, tag]);
    return `${iv.toString('hex')}:${ciphertextWithTag.toString('hex')}`;
  } catch (err) {
    console.error('[WhatsApp Auth] Encryption error:', err.message);
    throw err;
  }
};

const decryptData = (encryptedText) => {
  if (!encryptedText) return null;
  try {
    const key = getAesKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return null;

    const iv = Buffer.from(parts[0], 'hex');
    const ciphertextWithTag = Buffer.from(parts[1], 'hex');
    if (ciphertextWithTag.length < 16) return null;

    const tag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);
    const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'), BufferJSON.reviver);
  } catch (err) {
    console.error('[WhatsApp Auth] Decryption error:', err.message);
    return null;
  }
};

// Module-level in-memory cache: tenantId -> { creds, keys: Map() }
const authCache = new Map();

const getTenantAuth = (tenantId) => {
  let auth = authCache.get(tenantId);
  if (!auth) {
    auth = {
      creds: null,
      keys: new Map(),
    };
    authCache.set(tenantId, auth);
  }
  return auth;
};

const clearAuthState = (tenantId) => {
  authCache.delete(tenantId);
};

/**
 * Custom Multi-Tenant PostgreSQL Auth State Adapter for Baileys
 *
 * Implements AuthenticationState:
 *   - state: { creds, keys: { get, set } }
 *   - saveCreds: () => Promise<void>
 *
 * All reads and writes are strictly scoped to tenant_id.
 * Features an in-memory hot cache for instant, zero-latency key lookup and storage during handshakes.
 *
 * @param {string} tenantId - Tenant UUID
 * @param {Function} dbQuery - Database query function: (text, params, tenantId) => Promise<result>
 */
const usePostgresAuthState = async (tenantId, dbQuery) => {
  if (!tenantId) {
    throw new Error('usePostgresAuthState requires a valid tenantId.');
  }

  const tenantAuth = getTenantAuth(tenantId);

  // 1. Fetch existing creds from memory or database
  if (!tenantAuth.creds) {
    try {
      const sessionRes = await dbQuery(
        `SELECT creds_data FROM whatsapp_sessions WHERE tenant_id = $1`,
        [tenantId],
        tenantId
      );

      if (sessionRes.rows.length > 0 && sessionRes.rows[0].creds_data) {
        tenantAuth.creds = decryptData(sessionRes.rows[0].creds_data);
      }
    } catch (err) {
      console.warn(`[WhatsApp Auth] Could not read existing session for tenant ${tenantId}:`, err.message);
    }
  }

  // If no saved creds or decryption returned null, initialize fresh credentials
  if (!tenantAuth.creds) {
    tenantAuth.creds = initAuthCreds();
  }

  // CRITICAL: If credentials are not registered and not in an active pairing-code request,
  // ensure `me` and `account` are undefined so Baileys initiates a registration handshake (QR)
  // rather than a resume-login handshake for an unverified JID.
  if (!tenantAuth.creds.registered && !tenantAuth.isPairingCodePending) {
    delete tenantAuth.creds.me;
    delete tenantAuth.creds.account;
    delete tenantAuth.creds.signalIdentities;
    delete tenantAuth.creds.pairingCode;
  }

  const creds = tenantAuth.creds;

  // 2. Build key store (get, set) with hot in-memory lookup
  const keys = {
    get: async (type, ids) => {
      const data = {};
      if (!ids || ids.length === 0) return data;

      const missingIds = [];
      for (const id of ids) {
        const cacheKey = `${type}:${id}`;
        if (tenantAuth.keys.has(cacheKey)) {
          data[id] = tenantAuth.keys.get(cacheKey);
        } else {
          missingIds.push(id);
        }
      }

      if (missingIds.length > 0) {
        try {
          const res = await dbQuery(
            `SELECT key_id, key_data FROM whatsapp_auth_keys 
             WHERE tenant_id = $1 AND key_category = $2 AND key_id = ANY($3::text[])`,
            [tenantId, type, missingIds.map(String)],
            tenantId
          );

          const foundMap = {};
          for (const row of res.rows) {
            let value = decryptData(row.key_data);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            foundMap[row.key_id] = value;
            tenantAuth.keys.set(`${type}:${row.key_id}`, value);
          }

          for (const id of missingIds) {
            const val = foundMap[String(id)] ?? null;
            data[id] = val;
            if (!tenantAuth.keys.has(`${type}:${id}`)) {
              tenantAuth.keys.set(`${type}:${id}`, val);
            }
          }
        } catch (err) {
          console.error(`[WhatsApp Auth] Error getting keys for ${type} (tenant ${tenantId}):`, err.message);
          for (const id of missingIds) {
            data[id] = null;
          }
        }
      }

      return data;
    },

    set: async (data) => {
      const insertTasks = [];
      const deleteTasks = [];

      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          const cacheKey = `${category}:${id}`;
          if (value) {
            tenantAuth.keys.set(cacheKey, value);
            const encrypted = encryptData(value);
            insertTasks.push({ category, id: String(id), encrypted });
          } else {
            tenantAuth.keys.delete(cacheKey);
            deleteTasks.push({ category, id: String(id) });
          }
        }
      }

      // Upsert keys in batches of 50 asynchronously
      const BATCH_SIZE = 50;
      for (let i = 0; i < insertTasks.length; i += BATCH_SIZE) {
        const batch = insertTasks.slice(i, i + BATCH_SIZE);
        const values = [];
        const placeholders = [];
        let idx = 1;
        for (const item of batch) {
          placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, NOW())`);
          values.push(tenantId, item.category, item.id, item.encrypted);
          idx += 4;
        }

        try {
          await dbQuery(
            `INSERT INTO whatsapp_auth_keys (tenant_id, key_category, key_id, key_data, updated_at)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (tenant_id, key_category, key_id) DO UPDATE SET
               key_data = EXCLUDED.key_data,
               updated_at = NOW()`,
            values,
            tenantId
          );
        } catch (err) {
          console.error(`[WhatsApp Auth] Error batch upserting keys (tenant ${tenantId}):`, err.message);
        }
      }

      // Delete removed keys in batches grouped by category
      if (deleteTasks.length > 0) {
        const byCat = {};
        for (const item of deleteTasks) {
          byCat[item.category] = byCat[item.category] || [];
          byCat[item.category].push(item.id);
        }
        for (const cat in byCat) {
          try {
            await dbQuery(
              `DELETE FROM whatsapp_auth_keys 
               WHERE tenant_id = $1 AND key_category = $2 AND key_id = ANY($3::text[])`,
              [tenantId, cat, byCat[cat]],
              tenantId
            );
          } catch (err) {
            console.error(`[WhatsApp Auth] Error deleting keys for ${cat}:`, err.message);
          }
        }
      }
    },
  };

  // 3. saveCreds callback for Baileys creds.update
  const saveCreds = async (update) => {
    try {
      if (update && typeof update === 'object') {
        Object.assign(creds, update);
      }
      tenantAuth.creds = creds;
      const encryptedCreds = encryptData(creds);
      await dbQuery(
        `INSERT INTO whatsapp_sessions (tenant_id, creds_data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           creds_data = EXCLUDED.creds_data,
           updated_at = NOW()`,
        [tenantId, encryptedCreds],
        tenantId
      );
    } catch (err) {
      console.error(`[WhatsApp Auth] Error saving creds for tenant ${tenantId}:`, err.message);
    }
  };

  return {
    state: {
      creds,
      keys,
    },
    saveCreds,
  };
};

module.exports = {
  usePostgresAuthState,
  clearAuthState,
  getTenantAuth,
  encryptData,
  decryptData,
};
