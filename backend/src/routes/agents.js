const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── GET /api/agents ── returns all active agent instances for the tenant
router.get('/', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const result = await query(
    `SELECT id, name, config, is_active, created_at
     FROM agent_instances
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY created_at ASC`,
    [tenantId],
    tenantId
  );
  res.json({ agents: result.rows });
});

module.exports = router;
