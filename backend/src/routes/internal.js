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
           LOWER(tb.tool_name) LIKE '%' || LOWER($3) || '%'
         )) OR
         ($2 IS NULL AND $3 IS NULL)
       )
       ORDER BY tc.updated_at DESC
       LIMIT 1`,
      [tenantId, bindingId || null, toolId || null],
      tenantId,
    );

    // Fallback: If no credential found for specific tenantId, search globally for tool/provider matching (e.g. Gmail)
    if (result.rows.length === 0 && toolId) {
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
        [toolId]
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

module.exports = router;
