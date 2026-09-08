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

/**
 * Custom Multi-Tenant PostgreSQL Auth State Adapter for Baileys
 *
 * Implements AuthenticationState:
 *   - state: { creds, keys: { get, set } }
 *   - saveCreds: () => Promise<void>
 *
 * All reads and writes are strictly scoped to tenant_id.
 *
 * @param {string} tenantId - Tenant UUID
 * @param {Function} dbQuery - Database query function: (text, params, tenantId) => Promise<result>
 */
const usePostgresAuthState = async (tenantId, dbQuery) => {
  if (!tenantId) {
    throw new Error('usePostgresAuthState requires a valid tenantId.');
  }

  // 1. Fetch existing creds from whatsapp_sessions for this tenant
  let creds = null;
  try {
    const sessionRes = await dbQuery(
      `SELECT creds_data FROM whatsapp_sessions WHERE tenant_id = $1`,
      [tenantId],
      tenantId
    );

    if (sessionRes.rows.length > 0 && sessionRes.rows[0].creds_data) {
      creds = decryptData(sessionRes.rows[0].creds_data);
    }
  } catch (err) {
    console.warn(`[WhatsApp Auth] Could not read existing session for tenant ${tenantId}:`, err.message);
  }

  // If no saved creds or decryption returned null, initialize fresh credentials
  if (!creds) {
    creds = initAuthCreds();
  }

  // 2. Build key store (get, set)
  const keys = {
    get: async (type, ids) => {
      const data = {};
      if (!ids || ids.length === 0) return data;

      try {
        const res = await dbQuery(
          `SELECT key_id, key_data FROM whatsapp_auth_keys 
           WHERE tenant_id = $1 AND key_category = $2 AND key_id = ANY($3::text[])`,
          [tenantId, type, ids],
          tenantId
        );

        const foundMap = {};
        for (const row of res.rows) {
          let value = decryptData(row.key_data);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          foundMap[row.key_id] = value;
        }

        for (const id of ids) {
          data[id] = foundMap[id] || null;
        }
      } catch (err) {
        console.error(`[WhatsApp Auth] Error getting keys for ${type} (tenant ${tenantId}):`, err.message);
        for (const id of ids) {
          data[id] = null;
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
          if (value) {
            const encrypted = encryptData(value);
            insertTasks.push({ category, id, encrypted });
          } else {
            deleteTasks.push({ category, id });
          }
        }
      }

      // Upsert keys in batches or transactions
      for (const item of insertTasks) {
        try {
          await dbQuery(
            `INSERT INTO whatsapp_auth_keys (tenant_id, key_category, key_id, key_data, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (tenant_id, key_category, key_id) DO UPDATE SET
               key_data = EXCLUDED.key_data,
               updated_at = NOW()`,
            [tenantId, item.category, item.id, item.encrypted],
            tenantId
          );
        } catch (err) {
          console.error(`[WhatsApp Auth] Error upserting key ${item.category}/${item.id}:`, err.message);
        }
      }

      // Delete removed keys
      for (const item of deleteTasks) {
        try {
          await dbQuery(
            `DELETE FROM whatsapp_auth_keys 
             WHERE tenant_id = $1 AND key_category = $2 AND key_id = $3`,
            [tenantId, item.category, item.id],
            tenantId
          );
        } catch (err) {
          console.error(`[WhatsApp Auth] Error deleting key ${item.category}/${item.id}:`, err.message);
        }
      }
    },
  };

  // 3. saveCreds callback for Baileys creds.update
  const saveCreds = async () => {
    try {
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
  encryptData,
  decryptData,
};
