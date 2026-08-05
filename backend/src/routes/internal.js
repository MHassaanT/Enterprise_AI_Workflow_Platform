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

module.exports = router;
