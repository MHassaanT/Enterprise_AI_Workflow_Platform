const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── GET ALL USERS FOR TENANT (Admin Only) ──
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT id, email, role, created_at
     FROM users
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId],
    tenantId
  );

  res.json({ users: result.rows });
});

// ── PROVISION A REVIEWER ACCOUNT (Admin Only) ──
router.post('/reviewers', authenticate, authorize('admin'), async (req, res) => {
  const { email, password } = req.body;
  const { tenantId } = req.user;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  // Check if user already exists in this tenant
  const existing = await query(
    'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
    [tenantId, email],
    tenantId
  );

  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'A user with this email already exists in your tenant.' });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Insert reviewer user
  const result = await query(
    `INSERT INTO users (tenant_id, email, role, hashed_password)
     VALUES ($1, $2, 'reviewer', $3)
     RETURNING id, email, role, created_at`,
    [tenantId, email, hashedPassword],
    tenantId
  );

  const newUser = result.rows[0];

  // Log to audit trail
  await query(
    `INSERT INTO audit_logs (tenant_id, event_type, payload)
     VALUES ($1, 'reviewer_provisioned', $2)`,
    [tenantId, JSON.stringify({ reviewerId: newUser.id, email: newUser.email })],
    tenantId
  );

  res.status(201).json({
    message: 'Reviewer account provisioned successfully.',
    user: newUser
  });
});

module.exports = router;
