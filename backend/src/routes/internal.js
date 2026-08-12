const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { answerWithRAG } = require('../services/rag');

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
      `SELECT tc.encrypted_payload, tc.auth_type
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

    res.json({
      encrypted_payload: result.rows[0].encrypted_payload,
      auth_type: result.rows[0].auth_type,
    });
  } catch (error) {
    console.error(`Error fetching credentials for tenant ${tenantId}:`, error);
    res.status(500).json({ error: 'Failed to fetch tool credentials.' });
  }
});

module.exports = router;
