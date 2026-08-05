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
  if (process.env.OAUTH_REDIRECT_URI) {
    return process.env.OAUTH_REDIRECT_URI.replace(/\/+$/, '');
  }
  if (process.env.BACKEND_URL) {
    const baseUrl = process.env.BACKEND_URL.replace(/\/+$/, '');
    return `${baseUrl}/api/integrations/callback`;
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  const rawProto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const protocol = rawProto.split(',')[0].trim();
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
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId || clientId.startsWith('dummy_')) {
        return res.status(400).send(`
          <html><body style="font-family: system-ui, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; line-height: 1.6;">
            <h2 style="color: #38bdf8;">⚙️ GitHub OAuth Configuration Required</h2>
            <p>Please configure <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> in your server environment variables.</p>
            <p>Set your OAuth App's <strong>Authorization Callback URL</strong> in GitHub Developer Settings to:</p>
            <pre style="background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid #334155; color: #38bdf8;">${redirectUri}</pre>
          </body></html>
        `);
      }
      const scope = encodeURIComponent('repo user workflow');
      const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
      return res.redirect(authorizeUrl);
    } else if (provider === 'vercel') {
      const clientId = process.env.VERCEL_CLIENT_ID;
      const slug = process.env.VERCEL_INTEGRATION_SLUG;
      if (!clientId && !slug) {
        return res.status(400).send(`
          <html><body style="font-family: system-ui, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; line-height: 1.6;">
            <h2 style="color: #38bdf8;">⚙️ Vercel OAuth Configuration Required</h2>
            <p>Please configure <code>VERCEL_CLIENT_ID</code> and <code>VERCEL_CLIENT_SECRET</code> in your server environment variables.</p>
            <p>Set your Vercel Integration Redirect URI in Vercel Developer Console to:</p>
            <pre style="background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid #334155; color: #38bdf8;">${redirectUri}</pre>
          </body></html>
        `);
      }
      const authorizeUrl = clientId
        ? `https://vercel.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
        : `https://vercel.com/integrations/${slug}/new?state=${state}`;
      return res.redirect(authorizeUrl);
    } else if (provider === 'airtable') {
      const clientId = process.env.AIRTABLE_CLIENT_ID;
      if (!clientId || clientId.startsWith('dummy_')) {
        return res.status(400).send(`
          <html><body style="font-family: system-ui, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; line-height: 1.6;">
            <h2 style="color: #f59e0b;">⚙️ Airtable OAuth Configuration Required</h2>
            <p>Please configure <code>AIRTABLE_CLIENT_ID</code> and <code>AIRTABLE_CLIENT_SECRET</code> in your server environment variables.</p>
            <p>Set your Airtable OAuth App Redirect URI to:</p>
            <pre style="background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid #334155; color: #f59e0b;">${redirectUri}</pre>
          </body></html>
        `);
      }
      const scope = encodeURIComponent('data.records:read data.records:write schema.bases:read');
      const authorizeUrl = `https://airtable.com/oauth2/v1/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&scope=${scope}`;
      return res.redirect(authorizeUrl);
    } else if (provider === 'hubspot') {
      const clientId = process.env.HUBSPOT_CLIENT_ID;
      if (!clientId || clientId.startsWith('dummy_')) {
        return res.status(400).send(`
          <html><body style="font-family: system-ui, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; line-height: 1.6;">
            <h2 style="color: #ff7a59;">⚙️ HubSpot OAuth Configuration Required</h2>
            <p>Please configure <code>HUBSPOT_CLIENT_ID</code> and <code>HUBSPOT_CLIENT_SECRET</code> in your server environment variables.</p>
            <p>Set your HubSpot Developer App Redirect URL to:</p>
            <pre style="background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid #334155; color: #ff7a59;">${redirectUri}</pre>
          </body></html>
        `);
      }
      const scope = encodeURIComponent('crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write tickets');
      const authorizeUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
      return res.redirect(authorizeUrl);
    } else if (provider === 'clickup') {
      const clientId = process.env.CLICKUP_CLIENT_ID;
      if (!clientId || clientId.startsWith('dummy_')) {
        return res.status(400).send(`
          <html><body style="font-family: system-ui, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; line-height: 1.6;">
            <h2 style="color: #7b68ee;">⚙️ ClickUp OAuth Configuration Required</h2>
            <p>Please configure <code>CLICKUP_CLIENT_ID</code> and <code>CLICKUP_CLIENT_SECRET</code> in your server environment variables.</p>
            <p>Set your ClickUp App Redirect URL to:</p>
            <pre style="background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid #334155; color: #7b68ee;">${redirectUri}</pre>
          </body></html>
        `);
      }
      const authorizeUrl = `https://app.clickup.com/api?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
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
router.get(['/callback', '/callback/'], async (req, res) => {
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
    } else if (provider === 'airtable') {
      const clientId = process.env.AIRTABLE_CLIENT_ID || 'dummy_airtable_client_id';
      const clientSecret = process.env.AIRTABLE_CLIENT_SECRET || 'dummy_airtable_client_secret';
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      });

      const tokenRes = await fetch('https://airtable.com/oauth2/v1/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
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
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type || 'bearer',
        provider: 'airtable',
      };
    } else if (provider === 'hubspot') {
      const clientId = process.env.HUBSPOT_CLIENT_ID || 'dummy_hubspot_client_id';
      const clientSecret = process.env.HUBSPOT_CLIENT_SECRET || 'dummy_hubspot_client_secret';

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      });

      const tokenRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: params.toString(),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error || tokenData.status === 'error') {
        throw new Error(tokenData.message || tokenData.error_description || 'HubSpot token exchange failed');
      }

      tokenPayload = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: 'bearer',
        expires_in: tokenData.expires_in,
        provider: 'hubspot',
      };
    } else if (provider === 'clickup') {
      const clientId = process.env.CLICKUP_CLIENT_ID || 'dummy_clickup_client_id';
      const clientSecret = process.env.CLICKUP_CLIENT_SECRET || 'dummy_clickup_client_secret';

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      });

      const tokenRes = await fetch('https://api.clickup.com/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: params.toString(),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.err || tokenData.error) {
        throw new Error(tokenData.err || tokenData.error);
      }

      tokenPayload = {
        access_token: tokenData.access_token,
        token_type: 'bearer',
        provider: 'clickup',
      };
    } else {
      return res.status(400).send(`Unsupported provider '${provider}'`);
    }

    // Resolve or auto-register tool_id from tool_registry
    let toolQuery = await query(
      `SELECT id FROM tool_registry WHERE LOWER(canonical_name) = LOWER($1) OR LOWER(provider_type) = LOWER($1)`,
      [provider]
    );

    let toolId = null;
    if (toolQuery.rows.length > 0) {
      toolId = toolQuery.rows[0].id;
    } else {
      const canonicalName = provider === 'github' ? 'GitHub' : (provider.charAt(0).toUpperCase() + provider.slice(1));
      const displayName = `${canonicalName} Integration`;
      const insertRes = await query(
        `INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
         VALUES ($1, $2, $3, false, '{}'::jsonb)
         ON CONFLICT (canonical_name) DO UPDATE SET provider_type = EXCLUDED.provider_type
         RETURNING id`,
        [canonicalName, displayName, provider]
      );
      toolId = insertRes.rows[0].id;
    }

    // Encrypt token payload with AES-256-GCM
    const encryptedPayload = encryptPayload(tokenPayload);

    // Upsert into tool_credentials for tenant and toolId (handling any legacy null tool_id)
    const existing = await query(
      `SELECT id FROM tool_credentials WHERE tenant_id = $1 AND (tool_id = $2 OR tool_id IS NULL)`,
      [tenantId, toolId],
      tenantId
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE tool_credentials 
         SET tool_id = $1, encrypted_payload = $2, auth_type = 'oauth2', updated_at = NOW() 
         WHERE id = $3 AND tenant_id = $4`,
        [toolId, encryptedPayload, existing.rows[0].id, tenantId],
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

// ── POST /api/integrations/webhooks/vercel ── Receive Vercel Deployment & Event Webhooks
router.post('/webhooks/vercel', async (req, res) => {
  try {
    const signature = req.headers['x-vercel-signature'];
    const event = req.body;

    console.log(`[VERCEL WEBHOOK] Received event: ${event.type || 'unknown'}`, {
      payload_id: event.id,
      timestamp: event.createdAt,
    });

    // Handle signature verification if VERCEL_WEBHOOK_SECRET is set
    if (process.env.VERCEL_WEBHOOK_SECRET && signature) {
      const rawBody = JSON.stringify(req.body);
      const computed = crypto
        .createHmac('sha1', process.env.VERCEL_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');
      if (computed !== signature) {
        console.warn('[VERCEL WEBHOOK WARNING] Invalid signature received.');
        return res.status(401).json({ error: 'Invalid webhook signature.' });
      }
    }

    // Acknowledge receipt to Vercel
    res.status(200).json({ received: true, type: event.type || 'acknowledged' });
  } catch (error) {
    console.error('Error handling Vercel webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook.' });
  }
});

// ── POST /api/integrations/stripe/credentials ── Save Stripe Restricted API Key
router.post('/stripe/credentials', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { api_key } = req.body;

    if (!api_key) {
      return res.status(400).json({ error: 'Stripe Restricted API Key (api_key) is required.' });
    }

    // Resolve Stripe tool ID from tool_registry
    const toolQuery = await query(
      `SELECT id FROM tool_registry WHERE LOWER(canonical_name) = 'stripe' OR LOWER(provider_type) = 'stripe'`
    );

    let toolId = null;
    if (toolQuery.rows.length > 0) {
      toolId = toolQuery.rows[0].id;
    }

    const payload = { api_key, provider: 'stripe' };
    const encryptedPayload = encryptPayload(payload);

    // Upsert into tool_credentials
    const existing = await query(
      `SELECT id FROM tool_credentials WHERE tenant_id = $1 AND tool_id = $2`,
      [tenantId, toolId],
      tenantId
    );

    let credentialRecord;
    if (existing.rows.length > 0) {
      const updateRes = await query(
        `UPDATE tool_credentials 
         SET encrypted_payload = $1, auth_type = 'api_key', updated_at = NOW() 
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, tenant_id, tool_id, auth_type, updated_at`,
        [encryptedPayload, existing.rows[0].id, tenantId],
        tenantId
      );
      credentialRecord = updateRes.rows[0];
    } else {
      const insertRes = await query(
        `INSERT INTO tool_credentials (tenant_id, tool_id, auth_type, encrypted_payload, updated_at)
         VALUES ($1, $2, 'api_key', $3, NOW())
         RETURNING id, tenant_id, tool_id, auth_type, updated_at`,
        [tenantId, toolId, encryptedPayload],
        tenantId
      );
      credentialRecord = insertRes.rows[0];
    }

    res.status(200).json({
      message: '💳 Stripe Restricted API Key successfully encrypted and connected!',
      credential: credentialRecord,
    });
  } catch (error) {
    console.error('Error connecting Stripe credentials:', error);
    res.status(500).json({ error: 'Failed to connect Stripe credentials.' });
  }
});

// Generic Webhook Fallback
router.post('/webhooks', (req, res) => {
  console.log('[GENERIC WEBHOOK] Payload received:', req.body);
  res.status(200).json({ received: true });
});

module.exports = router;

