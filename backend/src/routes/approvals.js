const express = require('express');
const http = require('http');
const https = require('https');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Helper to send HTTP request to FastAPI agent service /agent/resume
const callAgentResume = (payload) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const agentUrl = new URL(`${process.env.AGENT_SERVICE_URL || 'http://localhost:8000'}/agent/resume`);
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
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ answer: 'Agent thread resumed successfully.' });
        }
      });
    });
    req.on('error', (err) => {
      console.error('Error calling /agent/resume:', err);
      resolve({ answer: 'Agent service resume notification failed.' });
    });
    req.write(body);
    req.end();
  });
};

// ── GET /api/approvals/pending ── Get all pending human approval requests
router.get('/pending', authenticate, authorize('admin', 'reviewer'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await query(
      `SELECT * FROM approval_requests 
       WHERE tenant_id = $1 AND status = 'pending'
       ORDER BY created_at ASC`,
      [tenantId],
      tenantId
    );
    res.json({ approvals: result.rows });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals.' });
  }
});

// ── POST /api/approvals/:id/action ── Approve or Reject a high-risk tool call
router.post('/:id/action', authenticate, authorize('admin', 'reviewer'), async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { id } = req.params;
    const { action } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: "Action must be 'approved' or 'rejected'." });
    }

    // 1. Update database record
    const result = await query(
      `UPDATE approval_requests 
       SET status = $1, resolved_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [action, id, tenantId],
      tenantId
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found.' });
    }

    const approvalReq = result.rows[0];

    // 2. Audit log write
    await query(
      `INSERT INTO audit_logs (tenant_id, event_type, payload)
       VALUES ($1, 'approval_decision', $2)`,
      [tenantId, JSON.stringify({ approvalId: id, decision: action, resolvedBy: userId })],
      tenantId
    );

    // 3. Forward to FastAPI /agent/resume
    let agentResult = null;
    if (approvalReq.conversation_id) {
      agentResult = await callAgentResume({
        approval_id: id,
        conversation_id: approvalReq.conversation_id,
        decision: action,
        tenant_id: tenantId,
        user_id: userId,
      });
    }

    res.json({
      message: `Approval request ${action} successfully.`,
      approval: approvalReq,
      agentResult,
    });
  } catch (error) {
    console.error('Error processing approval action:', error);
    res.status(500).json({ error: 'Failed to process approval action.' });
  }
});

module.exports = router;
