/**
 * Reported Issues Routes — Public API & Widget API
 *
 * Consumed by the Approvals & Appointments frontend page (Reported Issues tab)
 * and the customer-facing chat widget.
 * Provides CRUD for reported issues and the ability to manually trigger
 * Coding Agent investigation.
 */

const express = require('express');
const http = require('http');
const https = require('https');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { getGithubTokenForTenant, getGithubRepoForTenant } = require('../services/githubCredentials');

// ── GET /api/reported-issues/widget ── Get issues visible in the public widget (unauthenticated)
router.get('/widget', async (req, res) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId query param is required.' });
    }

    const result = await query(
      `SELECT id, title, description, category, severity, status, investigation_status,
              investigation_findings, root_cause, resolution_notes, created_at, updated_at
       FROM reported_issues
       WHERE tenant_id = $1 AND show_in_widget = true
       ORDER BY created_at DESC`,
      [tenantId],
      tenantId
    );

    res.json({ issues: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Error fetching widget issues:', error);
    res.status(500).json({ error: 'Failed to fetch widget issues.' });
  }
});

// All subsequent routes require user authentication
router.use(authenticate);

// ── GET /api/reported-issues ── List reported issues for tenant
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { status, severity, search, investigation_status } = req.query;

    let sql = `SELECT * FROM reported_issues WHERE tenant_id = $1`;
    const params = [tenantId];
    let idx = 2;

    if (status && status !== 'all') {
      sql += ` AND status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (severity && severity !== 'all') {
      sql += ` AND severity = $${idx}`;
      params.push(severity);
      idx++;
    }

    if (investigation_status && investigation_status !== 'all') {
      sql += ` AND investigation_status = $${idx}`;
      params.push(investigation_status);
      idx++;
    }

    if (search) {
      sql += ` AND (title ILIKE $${idx} OR description ILIKE $${idx} OR customer_message ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params, tenantId);
    res.json({ issues: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Error fetching reported issues:', error);
    res.status(500).json({ error: 'Failed to fetch reported issues.' });
  }
});

// ── GET /api/reported-issues/:id ── Get single issue with full details
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const result = await query(
      `SELECT * FROM reported_issues WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
      tenantId
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Reported issue not found.' });
    }

    res.json({ issue: result.rows[0] });
  } catch (error) {
    console.error('Error fetching reported issue:', error);
    res.status(500).json({ error: 'Failed to fetch reported issue.' });
  }
});

// ── PATCH /api/reported-issues/:id ── Update issue (resolve, dismiss, toggle widget visibility)
router.patch('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;
    const { status, resolution_notes, resolved_by, show_in_widget } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (status !== undefined) {
      updates.push(`status = $${idx}`);
      params.push(status);
      idx++;
      if (status === 'resolved' || status === 'dismissed' || status === 'no_code_issue') {
        updates.push(`resolved_at = NOW()`);
      }
    }

    if (resolution_notes !== undefined) {
      updates.push(`resolution_notes = $${idx}`);
      params.push(resolution_notes);
      idx++;
    }

    if (resolved_by !== undefined) {
      updates.push(`resolved_by = $${idx}`);
      params.push(resolved_by);
      idx++;
    }

    if (show_in_widget !== undefined) {
      updates.push(`show_in_widget = $${idx}`);
      params.push(show_in_widget);
      idx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE reported_issues
       SET ${updates.join(', ')}
       WHERE id = $${idx} AND tenant_id = $${idx + 1}
       RETURNING *`,
      [...params, id, tenantId],
      tenantId
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Reported issue not found.' });
    }

    // Write audit log for status changes
    if (status) {
      await query(
        `INSERT INTO audit_logs (tenant_id, event_type, payload) VALUES ($1, $2, $3)`,
        [tenantId, 'reported_issue_updated', JSON.stringify({
          issueId: id,
          newStatus: status,
          resolvedBy: resolved_by || 'human',
          updatedBy: req.user.email || req.user.id,
        })],
        tenantId
      );
    }

    res.json({ success: true, issue: result.rows[0] });
  } catch (error) {
    console.error('Error updating reported issue:', error);
    res.status(500).json({ error: 'Failed to update reported issue.' });
  }
});

// ── POST /api/reported-issues/:id/investigate ── Manually trigger Coding Agent investigation
router.post('/:id/investigate', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    // Fetch the issue
    const issueResult = await query(
      `SELECT * FROM reported_issues WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
      tenantId
    );

    if (!issueResult.rows[0]) {
      return res.status(404).json({ error: 'Reported issue not found.' });
    }

    const issue = issueResult.rows[0];

    if (issue.investigation_status === 'investigating') {
      return res.status(409).json({ error: 'Investigation is already in progress.' });
    }

    // Resolve tenant GitHub credentials and repository
    const githubToken = await getGithubTokenForTenant(tenantId);
    let repo = await getGithubRepoForTenant(tenantId);

    // If no repo connected, handle gracefully — mark as skipped or prompt connection
    if (!repo) {
      await query(
        `UPDATE reported_issues
         SET investigation_status = 'skipped',
             investigation_findings = 'No GitHub repository connected for this tenant. Unable to perform automated code investigation. Please connect a GitHub repository in the integrations settings or select a repo in the Coding Agent.',
             status = 'awaiting_review',
             updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
        tenantId
      );

      return res.json({
        success: true,
        message: 'No GitHub repository connected. Issue flagged for manual review.',
        investigation_skipped: true,
      });
    }

    // Call the Coding Agent to investigate
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const investigatePayload = JSON.stringify({
      issue_id: id,
      tenant_id: tenantId,
      repo: repo,
      base_branch: 'main',
      issue_title: issue.title,
      issue_description: issue.description,
      issue_customer_message: issue.customer_message || '',
    });

    const transport = agentUrl.startsWith('https') ? https : http;
    const url = new URL(`${agentUrl}/agent/coding/investigate-issue`);

    const agentReq = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(investigatePayload),
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN || '',
        ...(githubToken ? { 'Authorization': `Bearer ${githubToken}` } : {}),
      },
    }, (agentRes) => {
      let data = '';
      agentRes.on('data', (chunk) => (data += chunk));
      agentRes.on('end', () => {
        console.log('[INVESTIGATE] Coding Agent response:', data);
      });
    });

    agentReq.on('error', (err) => {
      console.error('[INVESTIGATE] Error calling Coding Agent:', err);
    });

    agentReq.write(investigatePayload);
    agentReq.end();

    // Update issue status to investigating
    await query(
      `UPDATE reported_issues SET status = 'investigating', investigation_status = 'investigating', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
      tenantId
    );

    res.json({ success: true, message: 'Investigation triggered. The Coding Agent is analyzing the issue.' });
  } catch (error) {
    console.error('Error triggering investigation:', error);
    res.status(500).json({ error: 'Failed to trigger investigation.' });
  }
});

module.exports = router;
