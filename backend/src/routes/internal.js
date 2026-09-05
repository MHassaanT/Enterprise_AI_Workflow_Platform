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

// ── GET /internal/tenants/:tenantId/company-context ──
// Returns tenant company details (name, description, website, industry, admin contact) for agent email context
router.get('/tenants/:tenantId/company-context', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const tenantRes = await query(
      `SELECT id, name, description, website, industry FROM tenants WHERE id = $1`,
      [tenantId],
      tenantId
    );

    const userRes = await query(
      `SELECT full_name, company_role, email FROM users WHERE tenant_id = $1 AND role = 'admin' LIMIT 1`,
      [tenantId],
      tenantId
    );

    const tenant = tenantRes.rows[0] || {};
    const adminUser = userRes.rows[0] || {};

    res.json({
      tenant_id: tenantId,
      company_name: tenant.name || 'Enterprise Client',
      description: tenant.description || '',
      website: tenant.website || '',
      industry: tenant.industry || '',
      sender_name: adminUser.full_name || 'Team Lead',
      sender_role: adminUser.company_role || 'Representative',
      sender_email: adminUser.email || '',
    });
  } catch (error) {
    console.error(`Error fetching company context for tenant ${tenantId}:`, error);
    res.json({
      tenant_id: tenantId,
      company_name: 'Enterprise Client',
      description: '',
      website: '',
      industry: '',
      sender_name: 'Team Lead',
      sender_role: 'Representative',
      sender_email: '',
    });
  }
});

// ── GET /internal/users/search ──
router.get('/users/search', async (req, res) => {
  const { email, phone, name } = req.query;
  const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;

  try {
    let sql = 'SELECT id, email, full_name, role FROM users WHERE 1=1';
    const params = [];
    let idx = 1;

    if (tenantId) {
      sql += ` AND tenant_id = $${idx}`;
      params.push(tenantId);
      idx++;
    }

    if (email) {
      sql += ` AND LOWER(email) = LOWER($${idx})`;
      params.push(email.trim());
      idx++;
    } else if (name) {
      sql += ` AND full_name ILIKE $${idx}`;
      params.push(`%${name.trim()}%`);
      idx++;
    }

    sql += ' LIMIT 5';
    const result = await query(sql, params, tenantId || undefined);
    if (result.rows.length > 0) {
      return res.json({ user: result.rows[0], users: result.rows });
    }
    return res.json({ user: null, users: [] });
  } catch (err) {
    console.error('Internal user search error:', err.message);
    res.status(500).json({ error: 'Failed to search users.' });
  }
});

// ── GET /internal/users/:userId ──
router.get('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const tenantId = req.headers['x-tenant-id'];

  if (userId === 'me' || !userId) {
    return res.status(404).json({ error: 'User identifier not provided.' });
  }

  try {
    const result = await query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1',
      [userId],
      tenantId || undefined
    );
    if (result.rows.length > 0) {
      return res.json({ user: result.rows[0] });
    }
    return res.status(404).json({ error: 'User not found.' });
  } catch (err) {
    console.error('Internal user get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
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

// ── POST /internal/rag/all-chunks ──
// Called by the Sales Agent ICP builder to fetch all uploaded knowledge base text chunks for grounding
router.post('/rag/all-chunks', async (req, res) => {
  const { tenantId, limit } = req.body;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId required.' });
  }

  try {
    const { getTenantChunks } = require('../services/qdrant');
    const chunks = await getTenantChunks(tenantId, { limit: limit || 40 });
    return res.json({ chunks });
  } catch (err) {
    console.error('Error fetching all RAG chunks:', err.message);
    return res.json({ chunks: [] });
  }
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

// ── POST /internal/db/query ──
// Called by Python agent service to execute database queries with tenant isolation
router.post('/db/query', async (req, res) => {
  const { sql, params, tenantId } = req.body;
  if (!sql) {
    return res.status(400).json({ error: 'SQL query string required.' });
  }

  try {
    const result = await query(sql, params || [], tenantId || null);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (error) {
    console.error('Error executing internal DB query:', error);
    res.status(500).json({ error: error.message, rows: [], rowCount: 0 });
  }
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
    // 1. Resolve tool metadata from tool_bindings if bindingId is provided
    let resolvedToolName = null;
    let resolvedConnectorType = null;
    let resolvedToolId = toolId || null;

    if (bindingId) {
      try {
        const bindingQuery = await query(
          `SELECT tool_id, tool_name, connector_type FROM tool_bindings WHERE id = $1`,
          [bindingId]
        );
        if (bindingQuery.rows.length > 0) {
          const row = bindingQuery.rows[0];
          if (row.tool_id) resolvedToolId = row.tool_id;
          if (row.tool_name) resolvedToolName = row.tool_name;
          if (row.connector_type) resolvedConnectorType = row.connector_type;
        }
      } catch (err) {
        console.warn(`[CREDENTIALS] Binding resolution warning for ${bindingId}:`, err.message);
      }
    }

    const searchTerm = resolvedToolId || resolvedToolName || resolvedConnectorType || toolId || null;

    let result = await query(
      `SELECT tc.id as credential_id, tc.encrypted_payload, tc.auth_type, tc.updated_at
       FROM tool_credentials tc
       LEFT JOIN tool_bindings tb ON tc.binding_id = tb.id OR tc.tool_id = tb.tool_id
       LEFT JOIN tool_registry tr ON tc.tool_id = tr.id OR tb.tool_id = tr.id
       WHERE tc.tenant_id = $1 AND (
         ($2::text IS NOT NULL AND (tc.binding_id::text = $2 OR tb.id::text = $2)) OR
         ($3::text IS NOT NULL AND (
           tc.tool_id::text = $3 OR 
           LOWER(tr.canonical_name) = LOWER($3) OR 
           LOWER(tr.provider_type) = LOWER($3) OR
           LOWER(tb.tool_name) = LOWER($3) OR
           LOWER(tb.connector_type) = LOWER($3) OR
           LOWER(tb.tool_name) LIKE '%' || LOWER($3) || '%'
         )) OR
         ($2 IS NULL AND $3 IS NULL)
       )
       ORDER BY tc.updated_at DESC
       LIMIT 1`,
      [tenantId, bindingId || null, searchTerm],
      tenantId,
    );

    // Fallback 1: Search tenant credentials broadly by provider/canonical name if no result yet
    if (result.rows.length === 0 && searchTerm) {
      result = await query(
        `SELECT tc.id as credential_id, tc.encrypted_payload, tc.auth_type, tc.updated_at
         FROM tool_credentials tc
         LEFT JOIN tool_registry tr ON tc.tool_id = tr.id
         WHERE tc.tenant_id = $1 AND (
           tc.tool_id::text = $2 OR
           LOWER(tr.canonical_name) = LOWER($2) OR
           LOWER(tr.provider_type) = LOWER($2)
         )
         ORDER BY tc.updated_at DESC
         LIMIT 1`,
        [tenantId, searchTerm],
        tenantId
      );
    }

    // Fallback 2: Global/default tool matching fallback if tool matches
    if (result.rows.length === 0 && searchTerm) {
      result = await query(
        `SELECT tc.id as credential_id, tc.encrypted_payload, tc.auth_type, tc.updated_at
         FROM tool_credentials tc
         LEFT JOIN tool_bindings tb ON tc.binding_id = tb.id OR tc.tool_id = tb.tool_id
         LEFT JOIN tool_registry tr ON tc.tool_id = tr.id OR tb.tool_id = tr.id
         WHERE (
           tc.tool_id::text = $1 OR 
           LOWER(tr.canonical_name) = LOWER($1) OR 
           LOWER(tr.provider_type) = LOWER($1) OR
           LOWER(tb.tool_name) LIKE '%' || LOWER($1) || '%'
         )
         ORDER BY tc.updated_at DESC
         LIMIT 1`,
        [searchTerm]
      );
    }

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
            } else if (provider === 'airtable') {
              console.log(`[CREDENTIALS] Token age ${Math.round(ageSeconds)}s > 3000s. Refreshing Airtable OAuth token...`);
              const clientId = process.env.AIRTABLE_CLIENT_ID || 'dummy_airtable_client_id';
              const clientSecret = process.env.AIRTABLE_CLIENT_SECRET || 'dummy_airtable_client_secret';
              const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

              const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: payload.refresh_token,
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

              if (tokenRes.ok) {
                const tokenData = await tokenRes.json();
                payload.access_token = tokenData.access_token;
                if (tokenData.refresh_token) payload.refresh_token = tokenData.refresh_token; // Airtable rotates refresh tokens

                encrypted_payload = encryptPayload(payload);
                await query(
                  `UPDATE tool_credentials SET encrypted_payload = $1, updated_at = NOW() WHERE id = $2`,
                  [encrypted_payload, credential_id],
                  tenantId
                );
                console.log(`[CREDENTIALS] Airtable token refreshed successfully.`);
              } else {
                console.warn(`[CREDENTIALS] Failed to refresh Airtable token: ${tokenRes.status} ${await tokenRes.text()}`);
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

// ═══════════════════════════════════════════════════════
//  HR AGENT INTERNAL ENDPOINTS
// ═══════════════════════════════════════════════════════

// ── GET /internal/hr/tenants-with-gmail ──
// Agent fetches all tenant IDs that have Gmail credentials for HR polling
router.get('/hr/tenants-with-gmail', async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT tc.tenant_id
       FROM tool_credentials tc
       JOIN tool_registry tr ON tc.tool_id = tr.id
       WHERE LOWER(tr.canonical_name) = 'gmail' AND tc.encrypted_payload IS NOT NULL`
    );
    res.json({ tenants: result.rows.map(r => r.tenant_id) });
  } catch (error) {
    console.error('Error fetching tenants with Gmail:', error);
    res.status(500).json({ error: 'Failed to fetch tenants.' });
  }
});

// ── GET /internal/hr/open-roles/:tenantId ──
// Agent fetches open roles for a tenant
router.get('/hr/open-roles/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const result = await query(
      `SELECT * FROM hr_open_roles WHERE tenant_id = $1 AND status = 'open' AND accepting_until > NOW()
       ORDER BY created_at DESC`,
      [tenantId],
      tenantId
    );
    res.json({ openRoles: result.rows });
  } catch (error) {
    console.error('Error fetching open roles:', error);
    res.status(500).json({ error: 'Failed to fetch open roles.' });
  }
});

// ── GET /internal/hr/polling-state/:tenantId ──
// Agent fetches the HR email polling state for deduplication
router.get('/hr/polling-state/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const result = await query(
      `SELECT * FROM hr_email_polling_state WHERE tenant_id = $1`,
      [tenantId],
      tenantId
    );
    if (result.rows[0]) {
      res.json({ state: result.rows[0] });
    } else {
      res.json({ state: { last_processed_message_ids: [], last_checked_at: null } });
    }
  } catch (error) {
    console.error('Error fetching polling state:', error);
    res.status(500).json({ error: 'Failed to fetch polling state.' });
  }
});

// ── POST /internal/hr/polling-state ──
// Agent saves the HR email polling state
router.post('/hr/polling-state', async (req, res) => {
  const { tenant_id, processed_ids } = req.body;

  try {
    await query(
      `INSERT INTO hr_email_polling_state (tenant_id, last_processed_message_ids, last_checked_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         last_processed_message_ids = EXCLUDED.last_processed_message_ids,
         last_checked_at = NOW()`,
      [tenant_id, JSON.stringify(processed_ids)],
      tenant_id
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving polling state:', error);
    res.status(500).json({ error: 'Failed to save polling state.' });
  }
});

// ── POST /internal/hr/applications ──
// Agent stores a classified application
router.post('/hr/applications', async (req, res) => {
  const { tenant_id, open_role_id, applicant_name, applicant_email, email_subject, email_body, email_message_id, resume_text, resume_filename, source } = req.body;

  try {
    const result = await query(
      `INSERT INTO hr_applications (tenant_id, open_role_id, applicant_name, applicant_email, email_subject, email_body, email_message_id, resume_text, resume_filename, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'received') RETURNING *`,
      [tenant_id, open_role_id, applicant_name, applicant_email, email_subject || null, email_body || null, email_message_id || null, resume_text || null, resume_filename || null, source || 'email'],
      tenant_id
    );
    res.status(201).json({ application: result.rows[0] });
  } catch (error) {
    console.error('Error storing application:', error);
    res.status(500).json({ error: 'Failed to store application.' });
  }
});

// ── PATCH /internal/hr/applications/:id/ack ──
// Agent marks ack email as sent
router.patch('/hr/applications/:id/ack', async (req, res) => {
  const { id } = req.params;
  try {
    await query(
      `UPDATE hr_applications SET ack_email_sent = TRUE, ack_email_sent_at = NOW() WHERE id = $1`,
      [id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating ack status:', error);
    res.status(500).json({ error: 'Failed to update ack status.' });
  }
});

// ── POST /internal/hr/talent-pool ──
// Agent stores an unmatched application in talent pool
router.post('/hr/talent-pool', async (req, res) => {
  const { tenant_id, applicant_name, applicant_email, email_subject, email_body, email_message_id, resume_text, resume_filename, desired_role } = req.body;

  try {
    const result = await query(
      `INSERT INTO hr_talent_pool (tenant_id, applicant_name, applicant_email, email_subject, email_body, email_message_id, resume_text, resume_filename, desired_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [tenant_id, applicant_name, applicant_email, email_subject || null, email_body || null, email_message_id || null, resume_text || null, resume_filename || null, desired_role || null],
      tenant_id
    );
    res.status(201).json({ prospect: result.rows[0] });
  } catch (error) {
    console.error('Error storing talent pool entry:', error);
    res.status(500).json({ error: 'Failed to store talent pool entry.' });
  }
});

// ── GET /internal/hr/talent-pool/:tenantId ──
// Agent fetches talent pool for scanning
router.get('/hr/talent-pool/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const result = await query(
      `SELECT * FROM hr_talent_pool WHERE tenant_id = $1 AND status = 'pooled' ORDER BY created_at DESC`,
      [tenantId],
      tenantId
    );
    res.json({ prospects: result.rows });
  } catch (error) {
    console.error('Error fetching talent pool:', error);
    res.status(500).json({ error: 'Failed to fetch talent pool.' });
  }
});

// ── PATCH /internal/hr/talent-pool/:id/transfer ──
// Agent transfers a prospect to a role
router.patch('/hr/talent-pool/:id/transfer', async (req, res) => {
  const { id } = req.params;
  const { open_role_id, tenant_id } = req.body;

  try {
    // Get the prospect data
    const prospectResult = await query(
      `SELECT * FROM hr_talent_pool WHERE id = $1 AND tenant_id = $2`,
      [id, tenant_id],
      tenant_id
    );

    if (!prospectResult.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found.' });
    }

    const prospect = prospectResult.rows[0];

    // Create an application from the prospect
    const appResult = await query(
      `INSERT INTO hr_applications (tenant_id, open_role_id, applicant_name, applicant_email, email_subject, email_body, email_message_id, resume_text, resume_filename, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'talent_pool_transfer', 'received') RETURNING *`,
      [tenant_id, open_role_id, prospect.applicant_name, prospect.applicant_email, prospect.email_subject, prospect.email_body, null, prospect.resume_text, prospect.resume_filename],
      tenant_id
    );

    // Mark the prospect as transferred
    await query(
      `UPDATE hr_talent_pool SET status = 'transferred', transferred_to_role = $1, transferred_at = NOW() WHERE id = $2`,
      [open_role_id, id],
      tenant_id
    );

    res.json({ application: appResult.rows[0] });
  } catch (error) {
    console.error('Error transferring prospect:', error);
    res.status(500).json({ error: 'Failed to transfer prospect.' });
  }
});

// ── GET /internal/hr/projects-behind-schedule/:tenantId ──
// Agent fetches projects that are behind schedule
router.get('/hr/projects-behind-schedule/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const result = await query(
      `SELECT p.*,
              COALESCE(
                (SELECT json_agg(json_build_object('employee_id', pm.employee_id, 'name', e.name, 'email', e.email, 'role', pm.role))
                 FROM hr_project_members pm
                 JOIN hr_employees e ON pm.employee_id = e.id
                 WHERE pm.project_id = p.id), '[]'::json
              ) as members
       FROM hr_projects p
       WHERE p.tenant_id = $1 AND p.status = 'active'
       ORDER BY p.expected_completion ASC`,
      [tenantId],
      tenantId
    );

    const now = new Date();
    // Filter to projects behind schedule, excluding any that received a reminder in the last 24 hours
    const behindSchedule = result.rows.filter(p => {
      if (p.last_reminder_sent_at) {
        const hoursSinceLastReminder = (now.getTime() - new Date(p.last_reminder_sent_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastReminder < 24) {
          return false; // Already sent reminder within last 24 hours
        }
      }
      const startDate = new Date(p.start_date);
      const endDate = new Date(p.expected_completion);
      const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
      const elapsedDays = Math.max(0, (now - startDate) / (1000 * 60 * 60 * 24));
      const expectedProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
      const pacingDelta = (p.current_progress || 0) - expectedProgress;
      return pacingDelta < -15; // Behind by 15%+
    });

    res.json({ projects: behindSchedule });
  } catch (error) {
    console.error('Error fetching behind-schedule projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects.' });
  }
});

// ── POST /internal/hr/projects/:id/reminder-sent ──
// Agent updates last_reminder_sent_at timestamp after sending a pacing email
router.post('/hr/projects/:id/reminder-sent', async (req, res) => {
  const { id } = req.params;

  try {
    await query(
      `UPDATE hr_projects SET last_reminder_sent_at = NOW() WHERE id = $1`,
      [id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating last_reminder_sent_at:', error);
    res.status(500).json({ error: 'Failed to update reminder timestamp.' });
  }
});

// ── GET /internal/hr/active-projects/:tenantId ──
// Agent fetches active projects to assist in email classification
router.get('/hr/active-projects/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const result = await query(
      `SELECT id, name, description, current_progress, status FROM hr_projects WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId],
      tenantId
    );
    res.json({ projects: result.rows });
  } catch (error) {
    console.error('Error fetching active projects:', error);
    res.status(500).json({ error: 'Failed to fetch active projects.' });
  }
});

// ── POST /internal/hr/project-update-from-email ──
// Agent records a project progress update received via email
router.post('/hr/project-update-from-email', async (req, res) => {
  const { tenant_id, project_id, sender_email, progress_pct, notes, blockers } = req.body;

  if (!tenant_id || !project_id || !notes) {
    return res.status(400).json({ error: 'tenant_id, project_id, and notes are required.' });
  }

  try {
    // 1. Find employee by email
    let employeeId = null;
    if (sender_email) {
      const empRes = await query(
        `SELECT id FROM hr_employees WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)`,
        [tenant_id, sender_email],
        tenant_id
      );
      if (empRes.rows[0]) {
        employeeId = empRes.rows[0].id;
      }
    }

    // Fallback: If employee not found by email, pick first member of the project or any employee in tenant
    if (!employeeId) {
      const memberRes = await query(
        `SELECT employee_id FROM hr_project_members WHERE project_id = $1 LIMIT 1`,
        [project_id],
        tenant_id
      );
      if (memberRes.rows[0]) {
        employeeId = memberRes.rows[0].employee_id;
      } else {
        const fallbackEmp = await query(
          `SELECT id FROM hr_employees WHERE tenant_id = $1 LIMIT 1`,
          [tenant_id],
          tenant_id
        );
        if (fallbackEmp.rows[0]) {
          employeeId = fallbackEmp.rows[0].id;
        }
      }
    }

    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record found for project update author.' });
    }

    // 2. Insert into hr_project_updates
    const updateResult = await query(
      `INSERT INTO hr_project_updates (project_id, submitted_by, progress_pct, notes, blockers)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [project_id, employeeId, progress_pct != null ? progress_pct : null, notes, blockers || null],
      tenant_id
    );

    // 3. Update hr_projects progress and summary
    if (progress_pct != null && !isNaN(progress_pct)) {
      await query(
        `UPDATE hr_projects 
         SET current_progress = $1, last_update_summary = $2, last_update_at = NOW(), updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [Math.min(100, Math.max(0, parseInt(progress_pct))), notes.substring(0, 250), project_id, tenant_id],
        tenant_id
      );
    } else {
      await query(
        `UPDATE hr_projects 
         SET last_update_summary = $1, last_update_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [notes.substring(0, 250), project_id, tenant_id],
        tenant_id
      );
    }

    // Get updated project details
    const projRes = await query(
      `SELECT * FROM hr_projects WHERE id = $1 AND tenant_id = $2`,
      [project_id, tenant_id],
      tenant_id
    );

    res.status(201).json({ update: updateResult.rows[0], project: projRes.rows[0] });
  } catch (error) {
    console.error('Error handling project update from email:', error);
    res.status(500).json({ error: 'Failed to record project update from email.' });
  }
});

// ═══════════════════════════════════════════════════════
//  DYNAMIC AGENT CONTEXT & ENTITY ENDPOINTS
// ═══════════════════════════════════════════════════════

// ── GET /internal/tenants/:tenantId/agent-context ──
// Returns the full agent context (entities, company, config) for the Python agent service
router.get('/tenants/:tenantId/agent-context', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const contextRes = await query(
      `SELECT * FROM tenant_agent_context WHERE tenant_id = $1 AND agent_type = 'customer_support'`,
      [tenantId], tenantId
    );
    const agentContext = contextRes.rows[0] || {};

    const entitiesRes = await query(
      `SELECT e.*, 
        COALESCE((SELECT json_agg(json_build_object(
          'field_name', f.field_name, 'display_name', f.display_name, 'field_type', f.field_type,
          'is_required', f.is_required, 'is_searchable', f.is_searchable, 'is_filterable', f.is_filterable,
          'enum_values', f.enum_values, 'reference_entity_id', f.reference_entity_id, 'description', f.description
        ) ORDER BY f.created_at) FROM tenant_entity_fields f WHERE f.entity_id = e.id), '[]'::json) as fields,
        COALESCE((SELECT json_agg(json_build_object(
          'operation_name', o.operation_name, 'is_enabled', o.is_enabled, 'requires_approval', o.requires_approval
        ) ORDER BY o.created_at) FROM tenant_entity_operations o WHERE o.entity_id = e.id), '[]'::json) as operations
      FROM tenant_entities e WHERE e.tenant_id = $1 AND e.is_enabled = true ORDER BY e.created_at`,
      [tenantId], tenantId
    );

    const companyRes = await query(
      `SELECT name, description, website, industry FROM tenants WHERE id = $1`,
      [tenantId], tenantId
    );
    const company = companyRes.rows[0] || {};

    res.json({
      tenant_id: tenantId,
      agent_context: {
        company_name: agentContext.company_name || company.name || 'Enterprise Client',
        company_description: agentContext.company_description || company.description || '',
        support_tone: agentContext.support_tone || 'professional',
        auto_escalate_keywords: agentContext.auto_escalate_keywords || [],
        auto_escalate_after_attempts: agentContext.auto_escalate_after_attempts || 3,
        max_tool_calls_per_turn: agentContext.max_tool_calls_per_turn || 5,
        enable_proactive_suggestions: agentContext.enable_proactive_suggestions !== false,
        custom_system_instructions: agentContext.custom_system_instructions || '',
      },
      entities: entitiesRes.rows,
      company: { name: company.name, description: company.description, website: company.website, industry: company.industry }
    });
  } catch (error) {
    console.error(`Error fetching agent context for tenant ${tenantId}:`, error);
    res.status(500).json({ error: 'Failed to fetch agent context.' });
  }
});

// ── GET /internal/tenants/:tenantId/entities/:entityName/search ──
// Generic entity search with filters — supports PostgreSQL & connected external DBs (Supabase)
router.get('/tenants/:tenantId/entities/:entityName/search', async (req, res) => {
  const { tenantId, entityName } = req.params;
  const { q, user_id, limit = 10, ...filters } = req.query;
  try {
    const entityRes = await query(
      `SELECT * FROM tenant_entities WHERE tenant_id = $1 AND entity_name = $2 AND is_enabled = true`,
      [tenantId, entityName], tenantId
    );
    if (!entityRes.rows[0]) {
      return res.json({ entity: entityName, results: [], count: 0, message: `Entity '${entityName}' not found.` });
    }
    const entity = entityRes.rows[0];
    const config = entity.data_source_config || {};

    const cleanName = entityName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const customTable = (config.table_name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    const candidateTables = [
      customTable,
      cleanName,
      cleanName + 's',
      cleanName.replace(/s$/, ''),
    ].filter(Boolean);

    // 1. Check if candidate table exists in PostgreSQL
    const tableRes = await query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [candidateTables],
      tenantId
    );

    if (tableRes.rows.length > 0) {
      const actualTable = tableRes.rows[0].table_name;
      const colRes = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [actualTable],
        tenantId
      );
      const cols = colRes.rows.map(c => c.column_name);
      const hasTenantId = cols.includes('tenant_id');
      const hasCreatedAt = cols.includes('created_at');

      const conditions = [];
      const params = [];
      let idx = 1;

      if (hasTenantId) {
        conditions.push(`tenant_id = $${idx}`);
        params.push(tenantId);
        idx++;
      }

      if (q) {
        const searchCols = cols.filter(c => ['name', 'email', 'title', 'status', 'description', 'id', 'passenger_name', 'rider_name'].includes(c));
        if (searchCols.length > 0) {
          const qClauses = searchCols.map(c => `${c}::text ILIKE $${idx}`);
          conditions.push(`(${qClauses.join(' OR ')})`);
          params.push(`%${q}%`);
          idx++;
        }
      }

      if (user_id && (cols.includes('user_id') || cols.includes('customer_id'))) {
        const userCol = cols.includes('user_id') ? 'user_id' : 'customer_id';
        conditions.push(`${userCol} = $${idx}`);
        params.push(user_id);
        idx++;
      }

      Object.entries(filters).forEach(([key, value]) => {
        const col = key.replace('filter_', '');
        if (cols.includes(col)) {
          conditions.push(`${col} = $${idx}`);
          params.push(value);
          idx++;
        }
      });

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderClause = hasCreatedAt ? `ORDER BY created_at DESC` : '';
      params.push(parseInt(limit) || 10);
      const sql = `SELECT * FROM ${actualTable} ${whereClause} ${orderClause} LIMIT $${idx}`;

      const result = await query(sql, params, tenantId);
      return res.json({ entity: entityName, results: result.rows, count: result.rowCount });
    }

    // 2. Check if tenant has connected Supabase in tool_credentials
    const supaCredsRes = await query(
      `SELECT tc.encrypted_payload 
       FROM tool_credentials tc 
       LEFT JOIN tool_registry tr ON tc.tool_id = tr.id
       WHERE tc.tenant_id = $1 AND (
         LOWER(tr.canonical_name) = 'supabase' OR 
         LOWER(tr.provider_type) = 'supabase'
       )
       LIMIT 1`,
      [tenantId],
      tenantId
    );

    if (supaCredsRes.rows.length > 0) {
      try {
        const supaPayload = decryptPayload(supaCredsRes.rows[0].encrypted_payload);
        const projectUrl = supaPayload.project_url || supaPayload.url;
        const serviceRoleKey = supaPayload.service_role_key || supaPayload.api_key || supaPayload.secret_key;
        if (projectUrl && serviceRoleKey) {
          for (const tbl of candidateTables) {
            const supaEndpoint = `${projectUrl.replace(/\/$/, '')}/rest/v1/${tbl}?select=*${q ? `&or=(status.ilike.*${encodeURIComponent(q)}*,id.ilike.*${encodeURIComponent(q)}*)` : ''}&limit=${parseInt(limit) || 10}`;
            const supaRes = await fetch(supaEndpoint, {
              headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Accept': 'application/json',
              }
            });
            if (supaRes.ok) {
              const supaData = await supaRes.json();
              return res.json({ entity: entityName, results: supaData, count: supaData.length });
            }
          }
        }
      } catch (supaErr) {
        console.warn('Supabase query error:', supaErr.message);
      }
    }

    // 3. Check if tenant has connected Airtable in tool_credentials
    const airtableCredsRes = await query(
      `SELECT tc.encrypted_payload 
       FROM tool_credentials tc 
       LEFT JOIN tool_registry tr ON tc.tool_id = tr.id
       WHERE tc.tenant_id = $1 AND (
         LOWER(tr.canonical_name) = 'airtable' OR 
         LOWER(tr.provider_type) = 'airtable'
       )
       LIMIT 1`,
      [tenantId],
      tenantId
    );

    if (airtableCredsRes.rows.length > 0) {
      try {
        const atPayload = decryptPayload(airtableCredsRes.rows[0].encrypted_payload);
        const atToken = atPayload.access_token || atPayload.api_key || atPayload.token;
        const atBaseId = config.base_id || atPayload.base_id || atPayload.default_base_id;
        if (atToken && atBaseId) {
          for (const tbl of candidateTables) {
            try {
              const encodedTbl = encodeURIComponent(tbl);
              const atUrl = `https://api.airtable.com/v0/${atBaseId}/${encodedTbl}?maxRecords=${parseInt(limit) || 10}`;
              const atRes = await fetch(atUrl, {
                headers: {
                  'Authorization': `Bearer ${atToken}`,
                  'Content-Type': 'application/json',
                }
              });
              if (atRes.ok) {
                const atData = await atRes.json();
                let records = (atData.records || []).map(r => ({ id: r.id, ...r.fields }));
                if (q) {
                  const qLower = String(q).toLowerCase();
                  const filtered = records.filter(r =>
                    Object.values(r).some(val => String(val).toLowerCase().includes(qLower))
                  );
                  if (filtered.length > 0) records = filtered;
                }
                if (records.length > 0) {
                  return res.json({ entity: entityName, results: records, count: records.length });
                }
              }
            } catch (tblErr) {
              // try next candidate table
            }
          }
        }
      } catch (atErr) {
        console.warn('Airtable entity query error:', atErr.message);
      }
    }

    // 4. Fallback: clean 200 response with 0 records
    return res.json({ entity: entityName, results: [], count: 0, message: `No ${entityName} records found.` });
  } catch (error) {
    console.error(`Error searching entity ${entityName}:`, error);
    res.json({ entity: entityName, results: [], count: 0, message: 'Search completed with 0 results.' });
  }
});

// ── GET /internal/tenants/:tenantId/entities/:entityName/:recordId ──
// Fetch a single entity record by ID
router.get('/tenants/:tenantId/entities/:entityName/:recordId', async (req, res) => {
  const { tenantId, entityName, recordId } = req.params;
  try {
    const entityRes = await query(
      `SELECT * FROM tenant_entities WHERE tenant_id = $1 AND entity_name = $2`,
      [tenantId, entityName], tenantId
    );
    if (!entityRes.rows[0]) {
      return res.json({ entity: entityName, record: null, message: `Entity '${entityName}' not found.` });
    }
    const config = entityRes.rows[0].data_source_config || {};
    const cleanName = entityName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const customTable = (config.table_name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    const candidateTables = [
      customTable,
      cleanName,
      cleanName + 's',
      cleanName.replace(/s$/, ''),
    ].filter(Boolean);

    // 1. Check PostgreSQL
    const tableRes = await query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [candidateTables],
      tenantId
    );

    if (tableRes.rows.length > 0) {
      const actualTable = tableRes.rows[0].table_name;
      const colRes = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [actualTable],
        tenantId
      );
      const cols = colRes.rows.map(c => c.column_name);
      const hasTenantId = cols.includes('tenant_id');
      const whereClause = hasTenantId ? `WHERE tenant_id = $1 AND id::text = $2` : `WHERE id::text = $1`;
      const params = hasTenantId ? [tenantId, recordId] : [recordId];

      const result = await query(
        `SELECT * FROM ${actualTable} ${whereClause} LIMIT 1`,
        params, tenantId
      );
      return res.json({ entity: entityName, record: result.rows[0] || null });
    }

    // 2. Check Supabase
    const supaCredsRes = await query(
      `SELECT tc.encrypted_payload 
       FROM tool_credentials tc 
       LEFT JOIN tool_registry tr ON tc.tool_id = tr.id
       WHERE tc.tenant_id = $1 AND (
         LOWER(tr.canonical_name) = 'supabase' OR 
         LOWER(tr.provider_type) = 'supabase'
       )
       LIMIT 1`,
      [tenantId],
      tenantId
    );

    if (supaCredsRes.rows.length > 0) {
      try {
        const supaPayload = decryptPayload(supaCredsRes.rows[0].encrypted_payload);
        const projectUrl = supaPayload.project_url || supaPayload.url;
        const serviceRoleKey = supaPayload.service_role_key || supaPayload.api_key || supaPayload.secret_key;
        if (projectUrl && serviceRoleKey) {
          for (const tbl of candidateTables) {
            const supaEndpoint = `${projectUrl.replace(/\/$/, '')}/rest/v1/${tbl}?id=eq.${encodeURIComponent(recordId)}&limit=1`;
            const supaRes = await fetch(supaEndpoint, {
              headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Accept': 'application/json',
              }
            });
            if (supaRes.ok) {
              const supaData = await supaRes.json();
              return res.json({ entity: entityName, record: supaData[0] || null });
            }
          }
        }
      } catch (supaErr) {
        console.warn('Supabase record fetch error:', supaErr.message);
      }
    }

    // 3. Check Airtable
    const airtableCredsRes = await query(
      `SELECT tc.encrypted_payload 
       FROM tool_credentials tc 
       LEFT JOIN tool_registry tr ON tc.tool_id = tr.id
       WHERE tc.tenant_id = $1 AND (
         LOWER(tr.canonical_name) = 'airtable' OR 
         LOWER(tr.provider_type) = 'airtable'
       )
       LIMIT 1`,
      [tenantId],
      tenantId
    );

    if (airtableCredsRes.rows.length > 0) {
      try {
        const atPayload = decryptPayload(airtableCredsRes.rows[0].encrypted_payload);
        const atToken = atPayload.access_token || atPayload.api_key || atPayload.token;
        const atBaseId = config.base_id || atPayload.base_id || atPayload.default_base_id;
        if (atToken && atBaseId) {
          for (const tbl of candidateTables) {
            try {
              const encodedTbl = encodeURIComponent(tbl);
              const atUrl = `https://api.airtable.com/v0/${atBaseId}/${encodedTbl}/${encodeURIComponent(recordId)}`;
              const atRes = await fetch(atUrl, {
                headers: {
                  'Authorization': `Bearer ${atToken}`,
                  'Content-Type': 'application/json',
                }
              });
              if (atRes.ok) {
                const atRecord = await atRes.json();
                return res.json({ entity: entityName, record: { id: atRecord.id, ...atRecord.fields } });
              }
            } catch (tblErr) {
              // try next candidate table
            }
          }
        }
      } catch (atErr) {
        console.warn('Airtable record fetch error:', atErr.message);
      }
    }

    res.json({ entity: entityName, record: null, message: 'Record not found.' });
  } catch (error) {
    console.error('Error fetching record:', error);
    res.json({ entity: entityName, record: null, message: 'Record not found.' });
  }
});

// ── POST /internal/support-tickets ──
// Create a new support ticket
router.post('/support-tickets', async (req, res) => {
  const { tenantId, conversationId, userId, userEmail, title, description, priority, category } = req.body;
  try {
    const result = await query(
      `INSERT INTO support_tickets (tenant_id, conversation_id, user_id, user_email, title, description, priority, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open') RETURNING *`,
      [tenantId, conversationId || null, userId || null, userEmail || null, title, description, priority || 'medium', category || null],
      tenantId
    );
    res.status(201).json({ ticket: result.rows[0] });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket.' });
  }
});

// ── GET /internal/support-tickets ──
// List tickets with tenant/user/status filters
router.get('/support-tickets', async (req, res) => {
  const { tenantId, userId, status, limit = 20 } = req.query;
  try {
    let sql = `SELECT * FROM support_tickets WHERE tenant_id = $1`;
    const params = [tenantId]; let idx = 2;
    if (userId) { sql += ` AND user_id = $${idx}`; params.push(userId); idx++; }
    if (status) { sql += ` AND status = $${idx}`; params.push(status); idx++; }
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`; params.push(parseInt(limit) || 20);
    const result = await query(sql, params, tenantId);
    res.json({ tickets: result.rows });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets.' });
  }
});

// ── POST /internal/support-tickets/:ticketId/notes ──
// Add a note to a ticket
router.post('/support-tickets/:ticketId/notes', async (req, res) => {
  const { ticketId } = req.params;
  const { note, authorType, authorId } = req.body;
  try {
    const result = await query(
      `INSERT INTO support_ticket_notes (ticket_id, note, author_type, author_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [ticketId, note, authorType || 'ai_agent', authorId || null]
    );
    await query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
    res.status(201).json({ note: result.rows[0] });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note.' });
  }
});

// ── PATCH /internal/support-tickets/:ticketId ──
// Update ticket status/assignment/resolution
router.patch('/support-tickets/:ticketId', async (req, res) => {
  const { ticketId } = req.params;
  const { status, assignedTo, resolutionSummary } = req.body;
  try {
    const updates = []; const params = []; let idx = 1;
    if (status) { updates.push(`status = $${idx}`); params.push(status); idx++; }
    if (assignedTo) { updates.push(`assigned_to = $${idx}`); params.push(assignedTo); idx++; }
    if (resolutionSummary) { updates.push(`resolution_summary = $${idx}`); params.push(resolutionSummary); idx++; }
    if (status === 'resolved' || status === 'closed') updates.push(`resolved_at = NOW()`);
    updates.push(`updated_at = NOW()`);
    params.push(ticketId);
    const result = await query(`UPDATE support_tickets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    res.json({ ticket: result.rows[0] });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket.' });
  }
});

// ── POST /internal/otp/generate ──
// Generate and store an email OTP for tenant customer support agent
router.post('/otp/generate', async (req, res) => {
  const { tenantId, email, conversationId, expiresInMinutes = 10 } = req.body;
  if (!tenantId || !email) {
    return res.status(400).json({ error: 'tenantId and email are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Generate secure 6-digit numeric OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Invalidate previous unverified OTPs for this tenant & email
    await query(
      `UPDATE tenant_email_otps 
       SET expires_at = NOW() 
       WHERE tenant_id = $1 AND LOWER(email) = $2 AND verified = FALSE AND expires_at > NOW()`,
      [tenantId, normalizedEmail],
      tenantId
    );

    // Insert new OTP record
    const result = await query(
      `INSERT INTO tenant_email_otps (tenant_id, conversation_id, email, otp_code, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, expires_at`,
      [tenantId, conversationId || null, normalizedEmail, otpCode, expiresAt],
      tenantId
    );

    res.json({
      success: true,
      otpCode,
      expiresAt: result.rows[0].expires_at,
      otpId: result.rows[0].id,
    });
  } catch (error) {
    console.error('Error generating OTP:', error);
    res.status(500).json({ error: 'Failed to generate OTP.' });
  }
});

// ── POST /internal/otp/verify ──
// Verify an email OTP code for customer support agent
router.post('/otp/verify', async (req, res) => {
  const { tenantId, email, otpCode, conversationId } = req.body;
  if (!tenantId || !email || !otpCode) {
    return res.status(400).json({ error: 'tenantId, email, and otpCode are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = otpCode.trim();

  try {
    // Fetch latest active OTP record
    const result = await query(
      `SELECT * FROM tenant_email_otps
       WHERE tenant_id = $1 AND LOWER(email) = $2 AND verified = FALSE
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, normalizedEmail],
      tenantId
    );

    if (result.rows.length === 0) {
      return res.json({
        verified: false,
        message: 'No pending verification code found for this email. Please request a new code.',
        remainingAttempts: 0,
      });
    }

    const otpRecord = result.rows[0];

    // Check expiration
    if (new Date(otpRecord.expires_at) < new Date()) {
      return res.json({
        verified: false,
        message: 'Verification code has expired. Please request a new code.',
        remainingAttempts: 0,
      });
    }

    // Check max attempts
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      return res.json({
        verified: false,
        message: 'Maximum verification attempts exceeded. Please request a new code.',
        remainingAttempts: 0,
      });
    }

    // Check code match
    if (otpRecord.otp_code !== cleanOtp) {
      const newAttempts = otpRecord.attempts + 1;
      await query(
        `UPDATE tenant_email_otps SET attempts = $1, updated_at = NOW() WHERE id = $2`,
        [newAttempts, otpRecord.id],
        tenantId
      );
      const remaining = Math.max(0, otpRecord.max_attempts - newAttempts);
      return res.json({
        verified: false,
        message: `Incorrect code. ${remaining} attempt(s) remaining.`,
        remainingAttempts: remaining,
      });
    }

    // Success! Mark as verified
    await query(
      `UPDATE tenant_email_otps 
       SET verified = TRUE, verified_at = NOW(), updated_at = NOW() 
       WHERE id = $1`,
      [otpRecord.id],
      tenantId
    );

    res.json({
      verified: true,
      message: 'Email successfully verified.',
      email: normalizedEmail,
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP.' });
  }
});

// ── GET /internal/otp/status ──
// Check if user email has been verified recently (within last 30 minutes)
router.get('/otp/status', async (req, res) => {
  const { tenantId, email } = req.query;
  if (!tenantId || !email) {
    return res.status(400).json({ error: 'tenantId and email are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const result = await query(
      `SELECT * FROM tenant_email_otps
       WHERE tenant_id = $1 AND LOWER(email) = $2 AND verified = TRUE
         AND verified_at > NOW() - INTERVAL '30 minutes'
       ORDER BY verified_at DESC
       LIMIT 1`,
      [tenantId, normalizedEmail],
      tenantId
    );

    res.json({
      verified: result.rows.length > 0,
      lastVerifiedAt: result.rows[0]?.verified_at || null,
    });
  } catch (error) {
    console.error('Error checking OTP status:', error);
    res.status(500).json({ error: 'Failed to check OTP status.' });
  }
});

// ── POST /internal/appointments ──
// Called by the AI Customer Support Agent to book a service appointment
router.post('/appointments', async (req, res) => {
  const {
    tenantId,
    conversationId,
    customer_name,
    customer_email,
    customer_phone,
    service_type,
    appointment_date,
    appointment_time,
    duration_minutes = 60,
    notes = '',
  } = req.body;

  if (!tenantId || !customer_name || !customer_email || !service_type || !appointment_date || !appointment_time) {
    return res.status(400).json({
      error: 'tenantId, customer_name, customer_email, service_type, appointment_date, and appointment_time are required.'
    });
  }

  try {
    const result = await query(
      `INSERT INTO appointments (
        tenant_id, conversation_id, customer_name, customer_email, customer_phone,
        service_type, appointment_date, appointment_time,
        duration_minutes, notes, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', 'ai_agent')
      RETURNING *`,
      [
        tenantId,
        conversationId || null,
        customer_name.trim(),
        customer_email.trim().toLowerCase(),
        customer_phone ? customer_phone.trim() : null,
        service_type.trim(),
        appointment_date,
        appointment_time.trim(),
        parseInt(duration_minutes) || 60,
        notes || ''
      ],
      tenantId
    );

    res.status(201).json({
      success: true,
      appointment: result.rows[0],
      appointment_id: result.rows[0].id,
    });
  } catch (error) {
    console.error('Error creating internal appointment:', error);
    res.status(500).json({ error: 'Failed to create appointment.' });
  }
});

// ── GET /internal/appointments ──
// Called by the AI agent to check existing appointments or availability
router.get('/appointments', async (req, res) => {
  const { tenantId, email, date, status } = req.query;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required.' });
  }

  try {
    let sql = 'SELECT * FROM appointments WHERE tenant_id = $1';
    const params = [tenantId];
    let idx = 2;

    if (email) {
      sql += ` AND LOWER(customer_email) = $${idx}`;
      params.push(email.trim().toLowerCase());
      idx++;
    }

    if (date) {
      sql += ` AND appointment_date = $${idx}`;
      params.push(date);
      idx++;
    }

    if (status) {
      sql += ` AND status = $${idx}`;
      params.push(status.toLowerCase());
      idx++;
    }

    sql += ' ORDER BY appointment_date ASC, appointment_time ASC LIMIT 20';
    const result = await query(sql, params, tenantId);

    res.json({
      appointments: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error querying internal appointments:', error);
    res.status(500).json({ error: 'Failed to query appointments.' });
  }
});

// ── POST /internal/appointments/reschedule ──
// Called by AI agent to reschedule an existing appointment
router.post('/appointments/reschedule', async (req, res) => {
  const { tenantId, appointment_id, customer_email, new_date, new_time, notes } = req.body;
  if (!tenantId || (!appointment_id && !customer_email) || !new_date || !new_time) {
    return res.status(400).json({
      error: 'tenantId, (appointment_id or customer_email), new_date, and new_time are required.',
    });
  }

  try {
    let existing;
    if (appointment_id) {
      const findRes = await query(
        `SELECT * FROM appointments WHERE id = $1 AND tenant_id = $2`,
        [appointment_id, tenantId],
        tenantId
      );
      existing = findRes.rows[0];
    } else {
      const findRes = await query(
        `SELECT * FROM appointments 
         WHERE tenant_id = $1 AND LOWER(customer_email) = $2 AND status = 'scheduled'
         ORDER BY appointment_date ASC, appointment_time ASC LIMIT 1`,
        [tenantId, customer_email.trim().toLowerCase()],
        tenantId
      );
      existing = findRes.rows[0];
    }

    if (!existing) {
      return res.status(404).json({
        error: 'No active scheduled appointment found to reschedule.',
      });
    }

    const noteAppend = notes ? `\n[Rescheduled to ${new_date} ${new_time}]: ${notes}` : `\n[Rescheduled to ${new_date} ${new_time}]`;
    const updateRes = await query(
      `UPDATE appointments
       SET appointment_date = $1,
           appointment_time = $2,
           notes = COALESCE(notes, '') || $3,
           status = 'scheduled',
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [new_date, new_time.trim(), noteAppend, existing.id, tenantId],
      tenantId
    );

    res.json({
      success: true,
      appointment: updateRes.rows[0],
      appointment_id: updateRes.rows[0].id,
      message: `Appointment rescheduled to ${new_date} at ${new_time}.`,
    });
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    res.status(500).json({ error: 'Failed to reschedule appointment.' });
  }
});

// ── POST /internal/appointments/cancel ──
// Called by AI agent to cancel an existing appointment
router.post('/appointments/cancel', async (req, res) => {
  const { tenantId, appointment_id, customer_email, reason } = req.body;
  if (!tenantId || (!appointment_id && !customer_email)) {
    return res.status(400).json({
      error: 'tenantId and (appointment_id or customer_email) are required.',
    });
  }

  try {
    let existing;
    if (appointment_id) {
      const findRes = await query(
        `SELECT * FROM appointments WHERE id = $1 AND tenant_id = $2`,
        [appointment_id, tenantId],
        tenantId
      );
      existing = findRes.rows[0];
    } else {
      const findRes = await query(
        `SELECT * FROM appointments 
         WHERE tenant_id = $1 AND LOWER(customer_email) = $2 AND status = 'scheduled'
         ORDER BY appointment_date ASC, appointment_time ASC LIMIT 1`,
        [tenantId, customer_email.trim().toLowerCase()],
        tenantId
      );
      existing = findRes.rows[0];
    }

    if (!existing) {
      return res.status(404).json({
        error: 'No active scheduled appointment found to cancel.',
      });
    }

    const noteAppend = reason ? `\n[Cancelled by customer]: ${reason}` : `\n[Cancelled by customer]`;
    const updateRes = await query(
      `UPDATE appointments
       SET status = 'cancelled',
           notes = COALESCE(notes, '') || $1,
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [noteAppend, existing.id, tenantId],
      tenantId
    );

    res.json({
      success: true,
      appointment: updateRes.rows[0],
      appointment_id: updateRes.rows[0].id,
      message: 'Appointment cancelled successfully.',
    });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ error: 'Failed to cancel appointment.' });
  }
});

// ── PATCH /internal/appointments/:id ──
// General update endpoint for appointment
router.patch('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const { tenantId, appointment_date, appointment_time, duration_minutes, notes, status } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required.' });
  }

  try {
    const updates = [];
    const params = [];
    let idx = 1;

    if (appointment_date) {
      updates.push(`appointment_date = $${idx}`);
      params.push(appointment_date);
      idx++;
    }
    if (appointment_time) {
      updates.push(`appointment_time = $${idx}`);
      params.push(appointment_time);
      idx++;
    }
    if (duration_minutes) {
      updates.push(`duration_minutes = $${idx}`);
      params.push(parseInt(duration_minutes));
      idx++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${idx}`);
      params.push(notes);
      idx++;
    }
    if (status) {
      updates.push(`status = $${idx}`);
      params.push(status.toLowerCase());
      idx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update fields provided.' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);
    params.push(tenantId);

    const updateRes = await query(
      `UPDATE appointments
       SET ${updates.join(', ')}
       WHERE id = $${idx} AND tenant_id = $${idx + 1}
       RETURNING *`,
      params,
      tenantId
    );

    if (!updateRes.rows[0]) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    res.json({ success: true, appointment: updateRes.rows[0] });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

module.exports = router;
