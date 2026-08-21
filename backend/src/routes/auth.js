const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { query } = require('../db');

// ── CRAWL COMPANY WEBSITE (Crawl4AI Service Call) ──
router.post('/crawl-company', async (req, res) => {
  const { website } = req.body;

  if (!website || !website.trim()) {
    return res.status(400).json({ error: 'Company website URL is required.' });
  }

  const agentServiceUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';

  try {
    const response = await axios.post(`${agentServiceUrl}/agent/crawl-company`, { url: website.trim() }, { timeout: 35000 });
    return res.json(response.data);
  } catch (error) {
    console.error('Company crawling error:', error.response?.data || error.message);
    
    // Graceful fallback if crawler agent service is unreachable or errors out
    const cleanUrl = website.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const domainPart = cleanUrl.split('/')[0].split('.')[0];
    const inferredName = domainPart ? domainPart.charAt(0).toUpperCase() + domainPart.slice(1) : 'My Workspace';

    return res.json({
      success: false,
      company_name: inferredName,
      description: '',
      industry: '',
      website: website,
      warning: 'Could not automatically parse website. You can manually fill in your company details below.'
    });
  }
});

// ── REGISTER A NEW TENANT + ADMIN USER ──
router.post('/register', async (req, res) => {
  const { companyName, description, website, industry, fullName, companyRole, email, password } = req.body;

  if (!companyName || !email || !password) {
    return res.status(400).json({ error: 'Company Name, Email, and Password are required.' });
  }

  // Check if user email already exists
  const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser.rows[0]) {
    return res.status(400).json({ error: 'An account with this email already exists. Please Sign In.' });
  }

  // 1. Create the tenant (the company) with full company details
  const tenantResult = await query(
    `INSERT INTO tenants (name, description, website, industry) 
     VALUES ($1, $2, $3, $4) 
     RETURNING id, name, description, website, industry`,
    [companyName, description || null, website || null, industry || null]
  );
  const tenant = tenantResult.rows[0];

  // 2. Hash the password
  const hashedPassword = await bcrypt.hash(password, 12);

  // 3. Create the admin user for this tenant with full name & role
  const userResult = await query(
    `INSERT INTO users (tenant_id, email, role, hashed_password, full_name, company_role) 
     VALUES ($1, $2, 'admin', $3, $4, $5)
     RETURNING id, email, role, full_name, company_role`,
    [tenant.id, email, hashedPassword, fullName || null, companyRole || 'Administrator']
  );
  const user = userResult.rows[0];

  // 4. Create default agent instances for this tenant
  await query(
    `INSERT INTO agent_instances (tenant_id, name, config)
     VALUES ($1, 'Customer Support Agent', '{}')`,
    [tenant.id]
  );

  res.status(201).json({
    message: 'Company registered successfully.',
    tenant: { id: tenant.id, name: tenant.name },
    user: { id: user.id, email: user.email, role: user.role, fullName: user.full_name, companyRole: user.company_role }
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

  // Safe fallback for JWT secrets
  const secret = process.env.JWT_SECRET || 'default_fallback_jwt_secret_key_change_in_production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  // Create JWT token
  const token = jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email
    },
    secret,
    { expiresIn }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      fullName: user.full_name,
      companyRole: user.company_role
    }
  });
});

module.exports = router;
