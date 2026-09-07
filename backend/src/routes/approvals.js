const express = require('express');
const http = require('http');
const https = require('https');
const axios = require('axios');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { getGithubTokenForTenant, getGithubRepoForTenant } = require('../services/githubCredentials');

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

// ── GET /api/approvals (and /pending) ── Get all pending human approval requests
const getPendingApprovals = async (req, res) => {
  try {
    const tenantId = req.user ? req.user.tenantId : null;
    const userRole = req.user ? req.user.role : null;

    let result;
    // Admins and reviewers see all pending approval requests across tenants
    if (userRole === 'admin' || userRole === 'reviewer' || !tenantId) {
      result = await query(
        `SELECT * FROM approval_requests 
         WHERE status = 'pending'
         ORDER BY created_at DESC`
      );
    } else {
      result = await query(
        `SELECT * FROM approval_requests 
         WHERE (tenant_id = $1 OR tenant_id IS NULL) AND status = 'pending'
         ORDER BY created_at DESC`,
        [tenantId],
        tenantId
      );
    }
    res.json({ approvals: result.rows, pending_approvals: result.rows });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals.' });
  }
};

router.get('/', authenticate, getPendingApprovals);
router.get('/pending', authenticate, getPendingApprovals);

// ── POST /api/approvals/:id/action (and /decision) ── Approve or Reject a high-risk tool call
const handleApprovalAction = async (req, res) => {
  try {
    const tenantId = req.user ? req.user.tenantId : null;
    const userId = req.user ? req.user.id : null;
    const { id } = req.params;
    const action = (req.body.action || req.body.decision || '').toLowerCase(); // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: "Action or decision must be 'approved' or 'rejected'." });
    }

    // 1. Update database record by id
    const result = await query(
      `UPDATE approval_requests 
       SET status = $1, resolved_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [action, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found.' });
    }

    const approvalReq = result.rows[0];

    // 2. Audit log write
    await query(
      `INSERT INTO audit_logs (tenant_id, event_type, payload)
       VALUES ($1, 'approval_decision', $2)`,
      [approvalReq.tenant_id || tenantId, JSON.stringify({ approvalId: id, decision: action, resolvedBy: userId })]
    );

    // 2b. If this approval was for an issue investigation, update reported issue and trigger Coding Agent fix & PR
    if (approvalReq.action_type === 'issue_investigation_review') {
      const targetTenant = approvalReq.tenant_id || tenantId;
      let payload = approvalReq.action_payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
      }
      const issueId = payload.issue_id;

      if (action === 'approved') {
        // Mark as fixing
        await query(
          `UPDATE reported_issues
           SET status = 'fixing',
               resolution_notes = 'Approval granted by human reviewer. Coding Agent is autonomously applying code edits and opening Pull Request...',
               updated_at = NOW()
           WHERE id = $1 OR approval_id = $2`,
          [issueId, id]
        );

        // Run autonomous code fix and PR creation
        (async () => {
          try {
            const githubToken = await getGithubTokenForTenant(targetTenant);
            let repo = payload.investigation_repo || await getGithubRepoForTenant(targetTenant, githubToken);
            const baseBranch = payload.investigation_branch || 'main';

            const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
            const fixPayload = {
              issue_id: issueId || id,
              tenant_id: targetTenant,
              repo: repo || 'MHassaanT/Enterprise_AI_Workflow_Platform',
              base_branch: baseBranch,
              issue_title: payload.issue_title || 'Customer reported issue',
              issue_description: payload.issue_description || '',
              root_cause: payload.root_cause || '',
              investigated_files: payload.investigated_files || [],
              customer_message: payload.customer_message || '',
            };

            const fixRes = await axios.post(
              `${agentUrl}/agent/coding/fix-issue`,
              fixPayload,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production',
                  ...(githubToken ? { 'Authorization': `Bearer ${githubToken}` } : {}),
                },
                timeout: 180000,
              }
            );

            const data = fixRes.data || {};
            console.log(`[APPROVAL FIX SUCCESS] PR opened for issue ${issueId}:`, data.pr_url);
            await query(
              `UPDATE reported_issues
               SET status = 'resolved',
                   pr_url = $1,
                   pr_number = $2,
                   fix_branch = $3,
                   fix_summary = $4,
                   resolved_at = NOW(),
                   resolved_by = 'coding_agent',
                   resolution_notes = $5,
                   updated_at = NOW()
               WHERE (id = $6 OR approval_id = $7) AND tenant_id = $8`,
              [
                data.pr_url,
                data.pr_number,
                data.branch,
                data.summary,
                `Autonomous code fix applied on branch '${data.branch}'. Pull Request opened: ${data.pr_url}`,
                issueId,
                id,
                targetTenant
              ]
            );
          } catch (fixErr) {
            console.error(`[APPROVAL FIX ERROR] for issue ${issueId}:`, fixErr.response?.data || fixErr.message);
            await query(
              `UPDATE reported_issues
               SET status = 'awaiting_review',
                   resolution_notes = $1,
                   updated_at = NOW()
               WHERE (id = $2 OR approval_id = $3) AND tenant_id = $4`,
              [
                `Fix attempt error: ${fixErr.response?.data?.detail || fixErr.message}. You can retry from the Coding Agent.`,
                issueId,
                id,
                targetTenant
              ]
            );
          }
        })();
      } else {
        await query(
          `UPDATE reported_issues
           SET status = 'dismissed',
               resolved_at = NOW(),
               resolved_by = 'human',
               resolution_notes = $1,
               updated_at = NOW()
           WHERE (id = $2 OR approval_id = $3) AND tenant_id = $4`,
          [`Human reviewer ${action} the issue investigation findings.`, issueId, id, targetTenant]
        );
      }
    }

    // 3. Forward to FastAPI /agent/resume
    let agentResult = null;
    if (approvalReq.conversation_id) {
      agentResult = await callAgentResume({
        approval_id: id,
        conversation_id: approvalReq.conversation_id,
        decision: action,
        tenant_id: approvalReq.tenant_id || tenantId,
        user_id: userId,
      });
    }

    res.json({
      success: true,
      message: `Approval request ${action} successfully.`,
      approval: approvalReq,
      agentResult,
    });
  } catch (error) {
    console.error('Error processing approval action:', error);
    res.status(500).json({ error: 'Failed to process approval action.' });
  }
};

router.post('/:id/action', authenticate, handleApprovalAction);
router.post('/:id/decision', authenticate, handleApprovalAction);

module.exports = router;
