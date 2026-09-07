const crypto = require('crypto');
const { query } = require('../db');

const getAesKey = () => {
  const keyStr = process.env.ENCRYPTION_KEY || 'default-insecure-key-change-me-32b';
  if (keyStr.length === 64) {
    return Buffer.from(keyStr, 'hex');
  }
  return Buffer.from(keyStr.padEnd(32, '\0').slice(0, 32));
};

const decryptPayload = (encryptedStr) => {
  if (!encryptedStr) return null;
  try {
    const [ivHex, cipherHex] = encryptedStr.split(':');
    if (!ivHex || !cipherHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const cipherBytes = Buffer.from(cipherHex, 'hex');
    const authTag = cipherBytes.slice(cipherBytes.length - 16);
    const encryptedText = cipherBytes.slice(0, cipherBytes.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    console.error('[CREDENTIALS] Error decrypting payload:', e.message);
    return null;
  }
};

const getGithubTokenForTenant = async (tenantId) => {
  if (tenantId) {
    try {
      const result = await query(
        `SELECT tc.encrypted_payload
         FROM tool_credentials tc
         LEFT JOIN tool_registry tr ON tc.tool_id = tr.id
         WHERE (tc.tenant_id = $1 OR tc.tenant_id IS NULL) AND (
           LOWER(tr.canonical_name) = 'github' OR 
           LOWER(tr.provider_type) = 'github' OR
           LOWER(tc.encrypted_payload) LIKE '%github%'
         )
         ORDER BY tc.updated_at DESC
         LIMIT 1`,
        [tenantId]
      );

      if (result.rows.length > 0 && result.rows[0].encrypted_payload) {
        const payload = decryptPayload(result.rows[0].encrypted_payload);
        if (payload && payload.access_token) {
          return payload.access_token;
        }
      }
    } catch (err) {
      console.warn('[CREDENTIALS] Could not query tool_credentials:', err.message);
    }
  }

  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  return null;
};

const getGithubRepoForTenant = async (tenantId) => {
  if (tenantId) {
    try {
      const result = await query(
        `SELECT tc.encrypted_payload
         FROM tool_credentials tc
         LEFT JOIN tool_registry tr ON tc.tool_id = tr.id
         WHERE (tc.tenant_id = $1 OR tc.tenant_id IS NULL) AND (
           LOWER(tr.canonical_name) = 'github' OR 
           LOWER(tr.provider_type) = 'github' OR
           LOWER(tc.encrypted_payload) LIKE '%github%'
         )
         ORDER BY tc.updated_at DESC
         LIMIT 1`,
        [tenantId]
      );

      if (result.rows.length > 0 && result.rows[0].encrypted_payload) {
        const payload = decryptPayload(result.rows[0].encrypted_payload);
        if (payload && (payload.default_repo || payload.repo)) {
          return payload.default_repo || payload.repo;
        }
      }
    } catch (err) {
      console.warn('[CREDENTIALS] Could not query repo from tool_credentials:', err.message);
    }
  }

  if (process.env.GITHUB_DEFAULT_REPO) {
    return process.env.GITHUB_DEFAULT_REPO;
  }

  return null;
};

module.exports = {
  decryptPayload,
  getGithubTokenForTenant,
  getGithubRepoForTenant,
};
