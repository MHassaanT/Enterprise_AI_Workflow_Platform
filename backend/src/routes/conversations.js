const express = require('express');
const https = require('https');
const http = require('http');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { answerWithRAG } = require('../services/rag');

// ── AGENT SERVICE HELPER ──
// Calls the Python agent service for conversations backed by an agent instance.
// Falls back to direct RAG for conversations without an agent.
const callAgentService = (payload) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const agentUrl = new URL(`${process.env.AGENT_SERVICE_URL || 'http://localhost:8000'}/agent/run`);
    const transport = agentUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: agentUrl.hostname,
      port: agentUrl.port || (agentUrl.protocol === 'https:' ? 443 : 80),
      path: agentUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN || '',
      },
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid agent service response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

// ── START A NEW CONVERSATION ──
// All roles can start conversations
router.post('/', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { customerIdentifier, agentInstanceId } = req.body;
  const { tenantId } = req.user;

  const result = await query(
    `INSERT INTO conversations 
      (tenant_id, agent_instance_id, customer_identifier, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING *`,
    [tenantId, agentInstanceId || null, customerIdentifier || 'anonymous'],
    tenantId // activates RLS
  );

  // Log to audit trail
  await query(
    `INSERT INTO audit_logs (tenant_id, event_type, payload)
     VALUES ($1, 'conversation_started', $2)`,
    [tenantId, JSON.stringify({ conversationId: result.rows[0].id })],
    tenantId
  );

  res.status(201).json({ conversation: result.rows[0] });
});

// ── GET ALL CONVERSATIONS ──
// All roles can view
router.get('/', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT * FROM conversations 
     WHERE tenant_id = $1 
     ORDER BY created_at DESC`,
    [tenantId],
    tenantId
  );

  res.json({ conversations: result.rows });
});

// ── GET A SINGLE CONVERSATION WITH MESSAGES ──
router.get('/:id', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  const conversation = await query(
    'SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
    tenantId
  );

  if (!conversation.rows[0]) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const messages = await query(
    `SELECT * FROM messages 
     WHERE conversation_id = $1 
     ORDER BY created_at ASC`,
    [id],
    tenantId
  );

  res.json({
    conversation: conversation.rows[0],
    messages: messages.rows
  });
});

// ── SEND A MESSAGE ──
router.post('/:id/messages', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Message content required.' });
  }

  // Verify the conversation belongs to this tenant
  const convo = await query(
    'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
    tenantId
  );
  if (!convo.rows[0]) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  // 1. Save user message
  const userMessage = await query(
    `INSERT INTO messages (conversation_id, tenant_id, role, content)
     VALUES ($1, $2, 'user', $3)
     RETURNING *`,
    [id, tenantId, content],
    tenantId
  );

  // 2. Resolve the agent instance attached to this conversation
  const convoFull = await query(
    'SELECT agent_instance_id FROM conversations WHERE id = $1',
    [id], tenantId
  );
  const agentInstanceId = convoFull.rows[0]?.agent_instance_id;

  let answer, citations = [], approvalPending = false, approvalId = null;

  if (agentInstanceId) {
    // ── Agent-backed conversation: delegate to Python orchestration service ──
    const agentResult = await callAgentService({
      question: content,
      tenant_id: tenantId,
      agent_instance_id: agentInstanceId,
      conversation_id: id,
      user_id: req.user.id,
    });
    answer = agentResult.answer;
    citations = agentResult.citations || [];
    approvalPending = agentResult.approval_pending || false;
    approvalId = agentResult.approval_id || null;
  } else {
    // ── Fallback: direct RAG (conversations without an agent instance) ──
    const ragResult = await answerWithRAG(content, tenantId);
    answer = ragResult.answer;
    citations = ragResult.citations || [];
  }

  // 3. Persist the assistant's response with citations
  const agentMessage = await query(
    `INSERT INTO messages (conversation_id, tenant_id, role, content, citations_json)
     VALUES ($1, $2, 'assistant', $3, $4)
     RETURNING *`,
    [id, tenantId, answer, JSON.stringify(citations)],
    tenantId
  );

  // 4. Update conversation timestamp
  await query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
    [id], tenantId
  );

  res.status(201).json({
    userMessage: userMessage.rows[0],
    agentMessage: agentMessage.rows[0],
    citations,
    approvalPending,
    approvalId,
  });
});

// ── GET PENDING APPROVALS ── (reviewers and admins only)
router.get('/approvals/pending', authenticate, authorize('admin', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT * FROM approval_requests 
     WHERE tenant_id = $1 AND status = 'pending'
     ORDER BY created_at ASC`,
    [tenantId],
    tenantId
  );

  res.json({ approvals: result.rows });
});

// ── APPROVE OR REJECT ── (reviewers and admins only)
router.patch('/approvals/:id', authenticate, authorize('admin', 'reviewer'), async (req, res) => {
  const { tenantId, id: userId } = req.user;
  const { id } = req.params;
  const { decision } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or rejected.' });
  }

  const result = await query(
    `UPDATE approval_requests 
     SET status = $1, resolved_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [decision, id, tenantId],
    tenantId
  );

  // Log the decision
  await query(
    `INSERT INTO audit_logs (tenant_id, event_type, payload)
     VALUES ($1, 'approval_decision', $2)`,
    [tenantId, JSON.stringify({ approvalId: id, decision, resolvedBy: userId })],
    tenantId
  );

  res.json({ approval: result.rows[0] });
});

module.exports = router;
