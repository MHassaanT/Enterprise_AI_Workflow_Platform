const express = require('express');
const https = require('https');
const http = require('http');
const router = express.Router();
const { query } = require('../db');
const { answerWithRAG } = require('../services/rag');

// ── AGENT SERVICE HELPER FOR WIDGET ──
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

// ── START / RESUME A PUBLIC WIDGET CONVERSATION ──
router.post('/conversations', async (req, res) => {
  const { tenantId, customerIdentifier } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required.' });
  }

  // Check if tenant exists
  const tenantRes = await query(
    'SELECT id, name FROM tenants WHERE id = $1 AND is_active = true',
    [tenantId],
    tenantId
  );

  if (!tenantRes.rows[0]) {
    return res.status(404).json({ error: 'Tenant not found or inactive.' });
  }

  // Get or create default agent instance
  let agentRes = await query(
    `SELECT id FROM agent_instances WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
    tenantId
  );

  let agentId = agentRes.rows[0]?.id;
  if (!agentId) {
    agentRes = await query(
      `INSERT INTO agent_instances (tenant_id, name, config)
       VALUES ($1, 'Customer Support Agent', '{}')
       RETURNING id`,
      [tenantId],
      tenantId
    );
    agentId = agentRes.rows[0]?.id;
  }

  const result = await query(
    `INSERT INTO conversations 
      (tenant_id, agent_instance_id, customer_identifier, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING *`,
    [tenantId, agentId, customerIdentifier || 'External Web Visitor'],
    tenantId
  );

  res.status(201).json({
    conversation: result.rows[0],
    tenantName: tenantRes.rows[0].name
  });
});

// ── FETCH WIDGET CONVERSATION MESSAGES ──
router.get('/conversations/:id', async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.query;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId query parameter is required.' });
  }

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
     WHERE conversation_id = $1 AND tenant_id = $2
     ORDER BY created_at ASC`,
    [id, tenantId],
    tenantId
  );

  res.json({
    conversation: conversation.rows[0],
    messages: messages.rows
  });
});

// ── SEND MESSAGE FROM WIDGET ──
router.post('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { tenantId, content } = req.body;

  if (!tenantId || !content) {
    return res.status(400).json({ error: 'tenantId and content are required.' });
  }

  // Verify conversation belongs to tenant
  const convo = await query(
    'SELECT id, agent_instance_id FROM conversations WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
    tenantId
  );

  if (!convo.rows[0]) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const agentInstanceId = convo.rows[0].agent_instance_id;

  // 1. Save user message
  const userMessage = await query(
    `INSERT INTO messages (conversation_id, tenant_id, role, content)
     VALUES ($1, $2, 'user', $3)
     RETURNING *`,
    [id, tenantId, content],
    tenantId
  );

  let answer = 'Unable to generate response.';
  let citations = [];
  let approvalPending = false;
  let approvalId = null;

  if (agentInstanceId) {
    try {
      const historyRes = await query(
        `SELECT role, content FROM messages WHERE conversation_id = $1 AND tenant_id = $2 ORDER BY created_at ASC LIMIT 10`,
        [id, tenantId],
        tenantId
      );
      const history = (historyRes.rows || []).map(r => ({ role: r.role, content: r.content }));

      const agentResult = await callAgentService({
        question: content,
        tenant_id: tenantId,
        agent_instance_id: agentInstanceId,
        conversation_id: id,
        user_id: 'widget-visitor',
        history,
      });

      answer = agentResult?.answer || 'Unable to process your request.';
      citations = agentResult?.citations || [];
      approvalPending = agentResult?.approval_pending || false;
      approvalId = agentResult?.approval_id || null;
    } catch (agentErr) {
      console.warn('Agent service offline or error, falling back to direct RAG:', agentErr.message);
      const ragResult = await answerWithRAG(content, tenantId);
      answer = ragResult?.answer || 'Unable to process your request.';
      citations = ragResult?.citations || [];
    }
  } else {
    const ragResult = await answerWithRAG(content, tenantId);
    answer = ragResult?.answer || 'Unable to process your request.';
    citations = ragResult?.citations || [];
  }

  // 2. Save assistant message
  const agentMessage = await query(
    `INSERT INTO messages (conversation_id, tenant_id, role, content, citations_json)
     VALUES ($1, $2, 'assistant', $3, $4)
     RETURNING *`,
    [id, tenantId, answer, JSON.stringify(citations || [])],
    tenantId
  );

  // 3. Update conversation timestamp
  await query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
    tenantId
  );

  res.status(201).json({
    userMessage: userMessage.rows[0],
    agentMessage: agentMessage.rows[0],
    citations,
    approvalPending,
    approvalId
  });
});

module.exports = router;
