const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../db');
const { answerWithRAG } = require('../services/rag');
const { searchResumesForJD, getAllResumesForJD } = require('../services/hrQdrant');
const { embedQuery } = require('../services/embeddings');

// ── AES-256-GCM ENCRYPTION HELPERS ──
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

const decryptPayload = (encryptedStr) => {
  const [ivHex, cipherHex] = encryptedStr.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const cipherBytes = Buffer.from(cipherHex, 'hex');
  const authTag = cipherBytes.slice(cipherBytes.length - 16);
  const encryptedText = cipherBytes.slice(0, cipherBytes.length - 16);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
};

// ── INTERNAL TOKEN GUARD ──
// This router is never mounted on the public API — only the agent service calls it.
router.use((req, res, next) => {
  const token = req.headers['x-internal-token'];
  if (!token || token !== process.env.INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
});

// ── GET /internal/agents/:agentInstanceId/tools ──
// Returns the allowed tool bindings & MCP server endpoints for an agent instance
router.get('/agents/:agentInstanceId/tools', async (req, res) => {
  const { agentInstanceId } = req.params;

  try {
    const result = await query(
      `SELECT tb.id, tb.agent_instance_id, tb.tenant_id, tb.tool_id, tb.tool_name, tb.connector_type, tb.mcp_server_id, tb.config, tb.is_high_risk,
              tr.canonical_name, tr.display_name, tr.provider_type, tr.is_high_risk as registry_high_risk,
              ms.endpoint_url, ms.transport_type, ms.auth_headers
       FROM tool_bindings tb
       LEFT JOIN tool_registry tr ON tb.tool_id = tr.id OR LOWER(tb.tool_name) = LOWER(tr.canonical_name)
       LEFT JOIN mcp_servers ms ON tb.mcp_server_id = ms.id
       WHERE tb.agent_instance_id = $1`,
      [agentInstanceId]
    );

    if (result.rows.length === 0) {
      // Fallback for agent instances that don't have explicit DB bindings yet
      return res.json({
        agent_instance_id: agentInstanceId,
        tools: [
          { tool_name: 'check_order_status', connector_type: 'builtin', is_high_risk: false },
          { tool_name: 'escalate_to_human', connector_type: 'builtin', is_high_risk: true },
        ],
        is_default_fallback: true,
      });
    }

    res.json({
      agent_instance_id: agentInstanceId,
      tools: result.rows,
      is_default_fallback: false,
    });
  } catch (error) {
    console.error(`Error fetching tools for agent ${agentInstanceId}:`, error);
    res.status(500).json({ error: 'Failed to fetch agent tool bindings.' });
  }
});

// ── GET /internal/tenants/:tenantId/tools ──
// Returns ALL allowed tools & MCP server endpoints for a tenant (used by Workflow Engine)
router.get('/tenants/:tenantId/tools', async (req, res) => {
  const { tenantId } = req.params;

  try {
    // For workflows, we want to return all tools that the tenant has credentials for,
    // plus all builtin tools.
    // 1. Built-in tools and tools with credentials
    const registryResult = await query(
      `SELECT 
          tr.id as tool_id, tr.canonical_name as tool_name, tr.provider_type as connector_type, 
          tr.is_high_risk, tr.schema_json,
          tc.id as credential_id
       FROM tool_registry tr
       LEFT JOIN tool_credentials tc ON tr.id = tc.tool_id AND tc.tenant_id = $1
       WHERE tr.provider_type = 'builtin' OR tc.id IS NOT NULL`,
      [tenantId]
    );

    // 2. Remote MCP Servers (each server is effectively a bundle of tools, but we return the server info)
    // The Python gateway _find_matching_binding might not match by tool_name perfectly here for dynamic remote tools,
    // but for now we return them so they are available in the payload.
    const mcpResult = await query(
      `SELECT 
          id as mcp_server_id, name as tool_name, 'mcp' as connector_type,
          endpoint_url, transport_type, auth_headers
       FROM mcp_servers
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const tools = [...registryResult.rows, ...mcpResult.rows];

    res.json({
      tenant_id: tenantId,
      tools: tools,
      is_default_fallback: false,
    });
  } catch (error) {
    console.error(`Error fetching tools for tenant ${tenantId}:`, error);
    res.status(500).json({ error: 'Failed to fetch tenant tools.' });
  }
});

// ── POST /internal/rag/query ──
// Called by the Python agent's retriever node.
// Returns raw chunks + citations without creating a conversation message.
router.post('/rag/query', async (req, res) => {
  const { question, tenantId } = req.body;
  if (!question || !tenantId) {
    return res.status(400).json({ error: 'question and tenantId required.' });
  }

  const { answer, citations, retrievedChunks } = await answerWithRAG(question, tenantId);

  res.json({
    chunks: retrievedChunks,   // raw chunks for the agent's context window
    citations,                  // structured citations for persistence
    answer,                     // pre-generated answer (fallback if needed)
  });
});

// ── POST /internal/hr/search-resumes ──
// Called by the Python HR agent to search resume vectors against JD text
router.post('/hr/search-resumes', async (req, res) => {
  const { tenantId, jobDescriptionId, jobDescriptionText, limit } = req.body;
  if (!tenantId || !jobDescriptionId || !jobDescriptionText) {
    return res.status(400).json({ error: 'tenantId, jobDescriptionId, and jobDescriptionText required.' });
  }

  try {
    const queryVector = await embedQuery(jobDescriptionText);
    const chunks = await searchResumesForJD(queryVector, tenantId, jobDescriptionId, { limit: limit || 50 });
    res.json({ chunks });
  } catch (error) {
    console.error(`Error searching resumes for JD ${jobDescriptionId}:`, error);
    res.status(500).json({ error: 'Failed to search resumes.' });
  }
});

// ── GET /internal/hr/resumes/:jobDescriptionId ──
// Called by the Python HR agent to get ALL resume chunks for a given JD
router.get('/hr/resumes/:jobDescriptionId', async (req, res) => {
  const { jobDescriptionId } = req.params;
  const tenantId = req.query.tenantId;
  
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId required.' });
  }

  try {
    const chunks = await getAllResumesForJD(tenantId, jobDescriptionId);
    res.json({ chunks });
  } catch (error) {
    console.error(`Error getting all resumes for JD ${jobDescriptionId}:`, error);
    res.status(500).json({ error: 'Failed to get resumes.' });
  }
});

// ── POST /internal/approvals ──
// Called by the agent's approval_checkpoint node.
router.post('/approvals', async (req, res) => {
  const { tenantId, agentInstanceId, conversationId, actionType, actionPayload } = req.body;

  const result = await query(
    `INSERT INTO approval_requests (tenant_id, conversation_id, action_type, action_payload)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [tenantId, conversationId || null, actionType, JSON.stringify(actionPayload || {})],
    tenantId,
  );

  res.status(201).json({ approvalId: result.rows[0].id });
});

// ── POST /internal/audit ──
// Called by agent nodes to write audit log entries.
router.post('/audit', async (req, res) => {
  const { tenantId, eventType, payload } = req.body;

  await query(
    `INSERT INTO audit_logs (tenant_id, event_type, payload) VALUES ($1, $2, $3)`,
    [tenantId, eventType, JSON.stringify(payload || {})],
    tenantId,
  );

  res.status(201).json({ ok: true });
});

// ── POST /internal/credentials ──
// Called by the Python agent's credentials_manager to fetch encrypted tool credentials
// without requiring direct Postgres access from the agent service.
router.post('/credentials', async (req, res) => {
  const { tenantId, bindingId, toolId } = req.body;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required.' });
  }

  try {
    const result = await query(
      `SELECT tc.id as credential_id, tc.encrypted_payload, tc.auth_type, tc.updated_at
       FROM tool_credentials tc
       LEFT JOIN tool_bindings tb ON tc.binding_id = tb.id OR tc.tool_id = tb.tool_id
       LEFT JOIN tool_registry tr ON tc.tool_id = tr.id OR tb.tool_id = tr.id
       WHERE tc.tenant_id = $1 AND (
         (tc.binding_id = $2 AND $2 IS NOT NULL) OR
         (tc.tool_id = $3 AND $3 IS NOT NULL) OR
         (tb.id = $2 AND $2 IS NOT NULL) OR
         (tr.provider_type = 'airtable' OR LOWER(tb.tool_name) LIKE '%airtable%')
       )
       ORDER BY tc.updated_at DESC
       LIMIT 1`,
      [tenantId, bindingId || null, toolId || null],
      tenantId,
    );

    if (result.rows.length === 0) {
      return res.json({ encrypted_payload: null, auth_type: null });
    }

    let { credential_id, encrypted_payload, auth_type, updated_at } = result.rows[0];

    // Check if token needs refresh (older than 50 mins = 3000 seconds)
    if (auth_type === 'oauth2' && updated_at) {
      const ageSeconds = (Date.now() - new Date(updated_at).getTime()) / 1000;
      if (ageSeconds > 3000) {
        try {
          const payload = decryptPayload(encrypted_payload);
          if (payload.refresh_token) {
            const provider = payload.provider || '';
            if (['gmail', 'google_docs', 'google_sheets'].includes(provider)) {
              console.log(`[CREDENTIALS] Token age ${Math.round(ageSeconds)}s > 3000s. Refreshing Google OAuth token...`);
              const clientId = process.env.GOOGLE_CLIENT_ID;
              const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
              
              const params = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: payload.refresh_token,
                grant_type: 'refresh_token'
              });

              const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
              });

              if (tokenRes.ok) {
                const tokenData = await tokenRes.json();
                payload.access_token = tokenData.access_token;
                if (tokenData.refresh_token) payload.refresh_token = tokenData.refresh_token; // Sometimes they rotate it
                
                encrypted_payload = encryptPayload(payload);
                await query(
                  `UPDATE tool_credentials SET encrypted_payload = $1, updated_at = NOW() WHERE id = $2`,
                  [encrypted_payload, credential_id],
                  tenantId
                );
                console.log(`[CREDENTIALS] Google token refreshed successfully.`);
              } else {
                console.warn(`[CREDENTIALS] Failed to refresh Google token: ${tokenRes.status} ${await tokenRes.text()}`);
              }
            } else if (provider === 'hubspot') {
               // Extend for hubspot etc if needed
            }
          }
        } catch (e) {
          console.error('[CREDENTIALS] Error during token auto-refresh:', e.message);
        }
      }
    }

    res.json({
      encrypted_payload: encrypted_payload,
      auth_type: auth_type,
    });
  } catch (error) {
    console.error(`Error fetching credentials for tenant ${tenantId}:`, error);
    res.status(500).json({ error: 'Failed to fetch tool credentials.' });
  }
});

module.exports = router;
