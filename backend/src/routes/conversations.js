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
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`Agent service HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (e) { reject(new Error('Invalid agent service response: ' + data)); }
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

  let agentId = agentInstanceId;
  if (!agentId) {
    let agentRes = await query(
      `SELECT id FROM agent_instances WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
      tenantId
    );
    if (!agentRes.rows[0]) {
      agentRes = await query(
        `INSERT INTO agent_instances (tenant_id, name, config)
         VALUES ($1, 'Customer Support Agent', '{}')
         RETURNING id`,
        [tenantId],
        tenantId
      );
    }
    agentId = agentRes.rows[0]?.id || null;
  }

  const result = await query(
    `INSERT INTO conversations 
      (tenant_id, agent_instance_id, customer_identifier, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING *`,
    [tenantId, agentId, customerIdentifier || 'anonymous'],
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

// ── CLEAR ALL CHAT HISTORY FOR TENANT ──
router.delete('/', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  // 1. Delete approval requests linked to this tenant's conversations
  await query(
    `DELETE FROM approval_requests WHERE tenant_id = $1`,
    [tenantId],
    tenantId
  );

  // 2. Delete messages linked to this tenant
  await query(
    `DELETE FROM messages WHERE tenant_id = $1`,
    [tenantId],
    tenantId
  );

  // 3. Delete conversations linked to this tenant
  await query(
    `DELETE FROM conversations WHERE tenant_id = $1`,
    [tenantId],
    tenantId
  );

  // 4. Log to audit trail
  await query(
    `INSERT INTO audit_logs (tenant_id, event_type, payload)
     VALUES ($1, 'chat_history_cleared', $2)`,
    [tenantId, JSON.stringify({ clearedBy: req.user.id })],
    tenantId
  );

  res.json({ message: 'All chat history cleared successfully.' });
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

  let answer = 'Unable to generate response.';
  let citations = [];
  let approvalPending = false;
  let approvalId = null;

  if (agentInstanceId) {
    try {
      // Fetch recent conversation history memory (up to 10 messages)
      const historyRes = await query(
        `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 10`,
        [id], tenantId
      );
      const history = (historyRes.rows || []).map(r => ({ role: r.role, content: r.content }));

      const agentResult = await callAgentService({
        question: content,
        tenant_id: tenantId,
        agent_instance_id: agentInstanceId,
        conversation_id: id,
        user_id: req.user.id,
        history,
      });
      answer = agentResult?.answer || 'Unable to process your request.';
      citations = agentResult?.citations || [];
      approvalPending = agentResult?.approval_pending || false;
      approvalId = agentResult?.approval_id || null;
    } catch (agentErr) {
      console.warn('Agent service error, falling back to direct RAG:', agentErr.message);
      const ragResult = await answerWithRAG(content, tenantId);
      answer = ragResult?.answer || 'Unable to process your request.';
      citations = ragResult?.citations || [];
    }
  } else {
    const ragResult = await answerWithRAG(content, tenantId);
    answer = ragResult?.answer || 'Unable to process your request.';
    citations = ragResult?.citations || [];
  }

  // 3. Persist the assistant's response with citations
  const agentMessage = await query(
    `INSERT INTO messages (conversation_id, tenant_id, role, content, citations_json)
     VALUES ($1, $2, 'assistant', $3, $4)
     RETURNING *`,
    [id, tenantId, answer, JSON.stringify(citations || [])],
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
