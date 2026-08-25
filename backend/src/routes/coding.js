const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

// AES-256-GCM Decryption Helper for credentials stored in tool_credentials
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
    const iv = Buffer.from(ivHex, 'hex');
    const cipherBytes = Buffer.from(cipherHex, 'hex');
    const authTag = cipherBytes.slice(cipherBytes.length - 16);
    const encryptedText = cipherBytes.slice(0, cipherBytes.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    console.error('[CODING ROUTE] Error decrypting credential payload:', e.message);
    return null;
  }
};

const getGithubTokenForTenant = async (tenantId) => {
  if (tenantId) {
    try {
      // 1. Look up tool_credentials for tenant matching GitHub tool
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

      // 2. Fallback check: Check any tool_credentials row with provider = 'github'
      const fallbackResult = await query(
        `SELECT encrypted_payload FROM tool_credentials 
         ORDER BY updated_at DESC LIMIT 10`
      );
      for (const row of fallbackResult.rows) {
        if (row.encrypted_payload) {
          const p = decryptPayload(row.encrypted_payload);
          if (p && (p.provider === 'github' || p.scope?.includes('repo')) && p.access_token) {
            return p.access_token;
          }
        }
      }
    } catch (err) {
      console.warn('[CODING ROUTE WARNING] Could not query tool_credentials from DB:', err.message);
    }
  }

  // 3. Fallback to process.env.GITHUB_TOKEN if set
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  return null;
};

// Helper to construct headers with the decrypted GitHub token
const getForwardHeaders = async (req) => {
  const headers = {
    'x-internal-token': INTERNAL_SERVICE_TOKEN,
    'Content-Type': 'application/json'
  };

  const tenantId = req.user?.tenantId;
  const githubToken = await getGithubTokenForTenant(tenantId);

  if (githubToken) {
    headers['authorization'] = `Bearer ${githubToken}`;
  } else {
    console.warn(`[CODING ROUTE WARNING] No GitHub token found for tenant ${tenantId}. Repos fetch may use default fallback.`);
  }

  return headers;
};

// Apply authentication middleware to all coding routes
router.use(authenticate);

// GET /api/v1/coding/repos
router.get('/repos', async (req, res) => {
  try {
    const headers = await getForwardHeaders(req);
    const response = await axios.get(`${AGENT_SERVICE_URL}/agent/coding/repos`, { headers });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent repos proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to fetch repositories'
    });
  }
});

// GET /api/v1/coding/tree
router.get('/tree', async (req, res) => {
  try {
    const { repo, branch } = req.query;
    const headers = await getForwardHeaders(req);
    const response = await axios.get(`${AGENT_SERVICE_URL}/agent/coding/tree`, {
      params: { repo, branch },
      headers
    });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent tree proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to fetch file tree'
    });
  }
});

// GET /api/v1/coding/file
router.get('/file', async (req, res) => {
  try {
    const { repo, path, branch } = req.query;
    const headers = await getForwardHeaders(req);
    const response = await axios.get(`${AGENT_SERVICE_URL}/agent/coding/file`, {
      params: { repo, path, branch },
      headers
    });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent file proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to fetch file content'
    });
  }
});

// POST /api/v1/coding/create-branch
router.post('/create-branch', async (req, res) => {
  try {
    const headers = await getForwardHeaders(req);
    const response = await axios.post(`${AGENT_SERVICE_URL}/agent/coding/create-branch`, req.body, { headers });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent branch proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to create branch'
    });
  }
});

// POST /api/v1/coding/create-pr
router.post('/create-pr', async (req, res) => {
  try {
    const headers = await getForwardHeaders(req);
    const response = await axios.post(`${AGENT_SERVICE_URL}/agent/coding/create-pr`, req.body, { headers });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent PR proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to create PR'
    });
  }
});

// POST /api/v1/coding/chat
router.post('/chat', async (req, res) => {
  try {
    const headers = await getForwardHeaders(req);
    const response = await axios.post(`${AGENT_SERVICE_URL}/agent/coding/chat`, req.body, { headers });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent chat proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Coding Agent chat execution failed'
    });
  }
});

module.exports = router;
