const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── AES-256-GCM ENCRYPTION HELPER ──
const getAesKey = () => {
  const keyStr = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  if (keyStr.length === 64) {
    return Buffer.from(keyStr, 'hex');
  }
  return Buffer.from(keyStr.padEnd(32, '\0').slice(0, 32));
};

const encryptPayload = (payload) => {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertextWithTag = Buffer.concat([encrypted, tag]);
  return `${iv.toString('hex')}:${ciphertextWithTag.toString('hex')}`;
};

// Helper to construct base callback URI
const getCallbackUrl = (req) => {
  const host = req.get('host');
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}/api/integrations/callback`;
};

// ── GET /api/integrations/connect/:provider ── Initiate OAuth2 Redirection Flow
router.get('/connect/:provider', async (req, res) => {
  try {
    const provider = req.params.provider.toLowerCase();
    
    // Authenticate tenant from Bearer token query parameter or Header
    let token = req.query.token;
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(' ')[1];
    }

    let tenantId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production');
        tenantId = decoded.tenantId;
      } catch (err) {
        console.warn('OAuth Connect Token Verification Warning:', err.message);
      }
    }

    if (!tenantId && req.query.tenant_id) {
      tenantId = req.query.tenant_id;
    }

    if (!tenantId) {
      return res.status(401).send('<h2>Authentication Required</h2><p>Please log in to authorize this integration.</p>');
    }

    // Encode tenantId and provider into state
    const stateObj = { tenantId, provider, timestamp: Date.now() };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64url');
    const redirectUri = getCallbackUrl(req);

    if (provider === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID || 'dummy_github_client_id';
      const scope = encodeURIComponent('repo user workflow');
      const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
      return res.redirect(authorizeUrl);
    } else if (provider === 'vercel') {
      const clientId = process.env.VERCEL_CLIENT_ID || 'dummy_vercel_client_id';
      const authorizeUrl = `https://vercel.com/oauth/authorize?client_id=${clientId}&state=${state}`;
      return res.redirect(authorizeUrl);
    } else {
      return res.status(400).send(`<h2>Unsupported Provider</h2><p>Provider '${provider}' is not supported for OAuth2.</p>`);
    }
  } catch (error) {
    console.error('Error initiating OAuth connect:', error);
    res.status(500).send(`<h2>OAuth Connection Error</h2><p>${error.message}</p>`);
  }
});

// ── GET /api/integrations/callback ── Unified OAuth2 Callback & Code Exchange Handler
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.status(400).send(`
        <html><body>
          <h2>OAuth Authorization Rejected</h2>
          <p>${oauthError}</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body></html>
      `);
    }

    if (!code || !state) {
      return res.status(400).send('<h2>Invalid Request</h2><p>Missing code or state parameter.</p>');
    }

    // Decode state
    let stateObj;
    try {
      stateObj = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    } catch (err) {
      return res.status(400).send('<h2>Invalid State</h2><p>Failed to parse OAuth state payload.</p>');
    }

    const { tenantId, provider } = stateObj;
    if (!tenantId || !provider) {
      return res.status(400).send('<h2>Invalid State</h2><p>Missing tenant context in OAuth state.</p>');
    }

    const redirectUri = getCallbackUrl(req);
    let tokenPayload = {};

    // ── Code Exchange ──
    if (provider === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID || 'dummy_github_client_id';
      const clientSecret = process.env.GITHUB_CLIENT_SECRET || 'dummy_github_client_secret';

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      tokenPayload = {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || 'bearer',
        scope: tokenData.scope,
        provider: 'github',
      };
    } else if (provider === 'vercel') {
      const clientId = process.env.VERCEL_CLIENT_ID || 'dummy_vercel_client_id';
      const clientSecret = process.env.VERCEL_CLIENT_SECRET || 'dummy_vercel_client_secret';

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      });

      const tokenRes = await fetch('https://api.vercel.com/v2/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: params.toString(),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      tokenPayload = {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || 'bearer',
        team_id: tokenData.team_id,
        user_id: tokenData.user_id,
        provider: 'vercel',
      };
    } else {
      return res.status(400).send(`Unsupported provider '${provider}'`);
    }

    // Resolve tool_id from tool_registry
    const toolQuery = await query(
      `SELECT id FROM tool_registry WHERE LOWER(canonical_name) = LOWER($1) OR LOWER(provider_type) = LOWER($1)`,
      [provider]
    );

    let toolId = null;
    if (toolQuery.rows.length > 0) {
      toolId = toolQuery.rows[0].id;
    }

    // Encrypt token payload with AES-256-GCM
    const encryptedPayload = encryptPayload(tokenPayload);

    // Upsert into tool_credentials for tenant and toolId
    const existing = await query(
      `SELECT id FROM tool_credentials WHERE tenant_id = $1 AND tool_id = $2`,
      [tenantId, toolId],
      tenantId
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE tool_credentials 
         SET encrypted_payload = $1, auth_type = 'oauth2', updated_at = NOW() 
         WHERE id = $2 AND tenant_id = $3`,
        [encryptedPayload, existing.rows[0].id, tenantId],
        tenantId
      );
    } else {
      await query(
        `INSERT INTO tool_credentials (tenant_id, tool_id, auth_type, encrypted_payload, updated_at)
         VALUES ($1, $2, 'oauth2', $3, NOW())`,
        [tenantId, toolId, encryptedPayload],
        tenantId
      );
    }

    // Return HTML page with script to notify opener window and close popup
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 3rem; }
            .card { background: #1e293b; padding: 2rem; border-radius: 12px; display: inline-block; }
            .icon { font-size: 3rem; margin-bottom: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h2>${provider.toUpperCase()} Connected Successfully!</h2>
            <p>Credentials encrypted and stored. Closing window...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_SUCCESS', provider: '${provider}' }, '*');
            }
            setTimeout(() => {
              window.close();
            }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.status(500).send(`
      <html><body>
        <h2>OAuth Connection Failed</h2>
        <p>${error.message}</p>
        <script>setTimeout(() => window.close(), 4000);</script>
      </body></html>
    `);
  }
});

module.exports = router;
