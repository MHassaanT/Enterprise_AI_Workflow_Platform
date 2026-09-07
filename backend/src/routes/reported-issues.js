/**
 * Reported Issues Routes — Public API & Widget API
 *
 * Consumed by the Approvals & Appointments frontend page (Reported Issues tab)
 * and the customer-facing chat widget.
 * Provides CRUD for reported issues and the ability to manually trigger
 * Coding Agent investigation.
 */

const express = require('express');
const axios = require('axios');
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
    let repo = req.body?.repo || await getGithubRepoForTenant(tenantId, githubToken);
    const baseBranch = req.body?.base_branch || 'main';

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

    // Immediately update issue: mark investigating, store repo/branch, and clear old findings
    await query(
      `UPDATE reported_issues
       SET status = 'investigating',
           investigation_status = 'investigating',
           investigation_repo = $1,
           investigation_branch = $2,
           investigation_findings = 'Autonomous codebase investigation in progress. Inspecting repository structure and analyzing root cause...',
           root_cause = NULL,
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [repo, baseBranch, id, tenantId],
      tenantId
    );

    // Call the Coding Agent to investigate (asynchronously)
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const investigatePayload = {
      issue_id: id,
      tenant_id: tenantId,
      repo: repo,
      base_branch: baseBranch,
      issue_title: issue.title,
      issue_description: issue.description,
      issue_customer_message: issue.customer_message || '',
    };

    axios.post(
      `${agentUrl}/agent/coding/investigate-issue`,
      investigatePayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production',
          ...(githubToken ? { 'Authorization': `Bearer ${githubToken}` } : {}),
        },
        timeout: 120000,
      }
    ).then(async (agentRes) => {
      const data = agentRes.data || {};
      const findings = data.investigation_findings || null;
      const rootCause = data.root_cause || null;
      const investigatedFiles = data.investigated_files || [];
      let approvalId = data.approval_id || null;

      // Fallback: If approval was not created by agent, backend creates the approval right here!
      if (!approvalId && rootCause) {
        try {
          const appRes = await query(
            `INSERT INTO approval_requests (tenant_id, action_type, action_payload)
             VALUES ($1, $2, $3) RETURNING id`,
            [
              tenantId,
              'issue_investigation_review',
              JSON.stringify({
                issue_id: id,
                issue_title: issue.title,
                issue_description: issue.description,
                customer_message: issue.customer_message,
                investigation_repo: repo,
                investigation_branch: baseBranch,
                root_cause: rootCause,
                investigation_findings: findings,
                investigated_files: investigatedFiles,
              })
            ],
            tenantId
          );
          if (appRes.rows[0]) {
            approvalId = appRes.rows[0].id;
          }
        } catch (appErr) {
          console.error('[INVESTIGATE] Error creating approval fallback:', appErr.message);
        }
      }

      await query(
        `UPDATE reported_issues
         SET investigation_status = 'completed',
             status = 'awaiting_review',
             investigation_repo = $1,
             investigation_branch = $2,
             investigation_findings = $3,
             root_cause = $4,
             investigated_files = $5,
             approval_id = COALESCE($6, approval_id),
             updated_at = NOW()
         WHERE id = $7 AND tenant_id = $8`,
        [
          repo,
          baseBranch,
          findings || 'Autonomous code investigation completed.',
          rootCause || 'Analysis completed.',
          JSON.stringify(investigatedFiles),
          approvalId,
          id,
          tenantId
        ],
        tenantId
      );
      console.log(`[INVESTIGATE] Coding Agent investigation saved for issue ${id}`);
    }).catch(async (agentErr) => {
      console.error(`[INVESTIGATE] Coding Agent investigation error for issue ${id}:`, agentErr.response?.data || agentErr.message);
      await query(
        `UPDATE reported_issues
         SET investigation_status = 'failed',
             investigation_findings = $1,
             status = 'awaiting_review',
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [`Investigation error: ${agentErr.response?.data?.detail || agentErr.message}`, id, tenantId],
        tenantId
      );
    });

    res.json({ success: true, message: 'Investigation triggered. The Coding Agent is analyzing the issue.', repo });
  } catch (error) {
    console.error('Error triggering investigation:', error);
    res.status(500).json({ error: 'Failed to trigger investigation.' });
  }
});

// ── POST /api/reported-issues/:id/fix ── Manually trigger Coding Agent autonomous bug fix & PR
router.post('/:id/fix', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const issueResult = await query(
      `SELECT * FROM reported_issues WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
      tenantId
    );

    if (!issueResult.rows[0]) {
      return res.status(404).json({ error: 'Reported issue not found.' });
    }

    const issue = issueResult.rows[0];

    const githubToken = await getGithubTokenForTenant(tenantId);
    let repo = req.body?.repo || issue.investigation_repo || await getGithubRepoForTenant(tenantId, githubToken);
    const baseBranch = req.body?.base_branch || issue.investigation_branch || 'main';

    if (!repo) {
      return res.status(400).json({ error: 'No GitHub repository connected for this tenant.' });
    }

    // Set status to fixing
    await query(
      `UPDATE reported_issues
       SET status = 'fixing',
           resolution_notes = 'Coding Agent is applying code fix and creating Pull Request on GitHub...',
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
      tenantId
    );

    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const fixPayload = {
      issue_id: id,
      tenant_id: tenantId,
      repo: repo,
      base_branch: baseBranch,
      issue_title: issue.title,
      issue_description: issue.description,
      root_cause: issue.root_cause || '',
      investigated_files: issue.investigated_files || [],
      customer_message: issue.customer_message || '',
    };

    try {
      const fixResponse = await axios.post(
        `${agentUrl}/agent/coding/fix-issue`,
        fixPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production',
            ...(githubToken ? { 'Authorization': `Bearer ${githubToken}` } : {}),
          },
          timeout: 180000, // 3 minutes timeout
        }
      );

      const fixData = fixResponse.data || {};
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
         WHERE id = $6 AND tenant_id = $7`,
        [
          fixData.pr_url,
          fixData.pr_number,
          fixData.branch,
          fixData.summary,
          `Autonomous code fix applied on branch '${fixData.branch}'. Pull Request opened: ${fixData.pr_url}`,
          id,
          tenantId
        ],
        tenantId
      );

      return res.json({
        success: true,
        message: 'Pull Request opened successfully.',
        pr_url: fixData.pr_url,
        pr_number: fixData.pr_number,
        branch: fixData.branch,
        summary: fixData.summary,
      });
    } catch (agentErr) {
      console.error(`[FIX-ROUTE ERROR] Coding Agent fix error for issue ${id}:`, agentErr.response?.data || agentErr.message);
      await query(
        `UPDATE reported_issues
         SET status = 'awaiting_review',
             resolution_notes = $1,
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [`Fix attempt error: ${agentErr.response?.data?.detail || agentErr.message}`, id, tenantId],
        tenantId
      );
      return res.status(500).json({
        error: agentErr.response?.data?.detail || agentErr.message || 'Fix execution failed.'
      });
    }
  } catch (error) {
    console.error('Error triggering fix:', error);
    res.status(500).json({ error: 'Failed to trigger fix.' });
  }
});

module.exports = router;
