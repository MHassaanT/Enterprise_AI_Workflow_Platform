const crypto = require('crypto');
const axios = require('axios');
const { query } = require('../db');

const getAesKey = () => {
  const keyStr = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
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
      // 1. Direct match on tenant_id and GitHub tool
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

      // 2. Fallback check: Check any tool_credentials row with github token or scope
      const fallbackResult = await query(
        `SELECT encrypted_payload FROM tool_credentials 
         ORDER BY updated_at DESC LIMIT 10`
      );
      for (const row of fallbackResult.rows) {
        if (row.encrypted_payload) {
          const p = decryptPayload(row.encrypted_payload);
          if (p && (p.provider === 'github' || p.scope?.includes('repo') || p.access_token?.startsWith('ghp_') || p.access_token?.startsWith('gho_') || p.access_token?.startsWith('github_pat_')) && p.access_token) {
            return p.access_token;
          }
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

const getGithubRepoForTenant = async (tenantId, token = null) => {
  let resolvedToken = token;
  if (!resolvedToken && tenantId) {
    resolvedToken = await getGithubTokenForTenant(tenantId);
  }

  // 1. Check if tool_credentials has explicit default_repo or repo
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

  // 2. If token is available, query GitHub API for user's repos
  if (resolvedToken) {
    try {
      const cleanToken = resolvedToken.replace(/^(Bearer|token)\s+/i, '').trim();
      const resp = await axios.get('https://api.github.com/user/repos?per_page=10&sort=updated', {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Enterprise-AI-Platform',
        },
        timeout: 10000,
      });

      if (Array.isArray(resp.data) && resp.data.length > 0) {
        const firstRepo = resp.data[0].full_name;
        console.log(`[CREDENTIALS] Auto-detected GitHub repo from GitHub API: ${firstRepo}`);
        return firstRepo;
      }
    } catch (apiErr) {
      console.warn('[CREDENTIALS] Error auto-detecting repo from GitHub API:', apiErr.message);
    }

    // 2b. Fallback: query Coding Agent service if available
    try {
      const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
      const agentResp = await axios.get(`${agentUrl}/agent/coding/repos`, {
        headers: {
          'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production',
          'Authorization': `Bearer ${resolvedToken.replace(/^(Bearer|token)\s+/i, '').trim()}`,
        },
        timeout: 8000,
      });
      if (agentResp.data?.repositories?.length > 0) {
        const firstRepo = agentResp.data.repositories[0].full_name;
        console.log(`[CREDENTIALS] Auto-detected GitHub repo from agent service: ${firstRepo}`);
        return firstRepo;
      }
    } catch (agentErr) {
      // ignore
    }
  }

  // 3. Check process.env.GITHUB_DEFAULT_REPO
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
