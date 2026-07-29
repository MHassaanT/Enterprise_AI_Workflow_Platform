const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

// ── REGISTER A NEW TENANT + ADMIN USER ──
router.post('/register', async (req, res) => {
  const { companyName, email, password } = req.body;

  if (!companyName || !email || !password) {
    return res.status(400).json({ error: 'All fields required.' });
  }

  // 1. Create the tenant (the company)
  const tenantResult = await query(
    'INSERT INTO tenants (name) VALUES ($1) RETURNING id, name',
    [companyName]
  );
  const tenant = tenantResult.rows[0];

  // 2. Hash the password
  const hashedPassword = await bcrypt.hash(password, 12);

  // 3. Create the admin user for this tenant
  // 3. Create the admin user for this tenant
  await query(
    `INSERT INTO users (tenant_id, email, role, hashed_password) 
     VALUES ($1, $2, 'admin', $3)`,
    [tenant.id, email, hashedPassword]
  );

  // 4. Create a default agent instance for this tenant
  await query(
    `INSERT INTO agent_instances (tenant_id, name, config)
     VALUES ($1, 'Customer Support Agent', '{}')`,
    [tenant.id]
  );

  res.status(201).json({
    message: 'Company registered successfully.',
    tenant: { id: tenant.id, name: tenant.name }
  });
});

// ── LOGIN ──
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required.' });
  }

  // Find user by email
  const result = await query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  const user = result.rows[0];

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Verify password
  const validPassword = await bcrypt.compare(password, user.hashed_password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Create JWT token — this is the wristband
  const token = jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id
    }
  });
});

module.exports = router;
