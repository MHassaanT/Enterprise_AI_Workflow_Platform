const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { createFirebaseUser, generateVerificationLink, isEmailVerified, isFirebaseAvailable } = require('../services/firebaseAdmin');
const { sendVerificationEmail } = require('../services/emailService');
const { authenticate } = require('../middleware/auth');

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
// Modified: No auto-login. Creates Firebase shadow user for email verification.
// Returns a message prompting the user to verify their email.
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
  // Subscription defaults: plan='none', status='pending_verification'
  const tenantResult = await query(
    `INSERT INTO tenants (name, description, website, industry, subscription_plan, subscription_status) 
     VALUES ($1, $2, $3, $4, 'none', 'pending_verification') 
     RETURNING id, name, description, website, industry`,
    [companyName, description || null, website || null, industry || null]
  );
  const tenant = tenantResult.rows[0];

  // 2. Hash the password
  const hashedPassword = await bcrypt.hash(password, 12);

  // 3. Generate email verification token
  const verificationToken = uuidv4();

  // 4. Create the admin user for this tenant with full name & role
  const userResult = await query(
    `INSERT INTO users (tenant_id, email, role, hashed_password, full_name, company_role, email_verified, email_verification_token, email_verification_sent_at) 
     VALUES ($1, $2, 'admin', $3, $4, $5, false, $6, NOW())
     RETURNING id, email, role, full_name, company_role`,
    [tenant.id, email, hashedPassword, fullName || null, companyRole || 'Administrator', verificationToken]
  );
  const user = userResult.rows[0];

  // 5. Create default agent instances for this tenant
  await query(
    `INSERT INTO agent_instances (tenant_id, name, config)
     VALUES ($1, 'Customer Support Agent', '{}')`,
    [tenant.id]
  );

  // 6. Email verification via Firebase or fallback token
  let verificationLink = null;

  if (isFirebaseAvailable()) {
    // Create shadow Firebase user for verification
    await createFirebaseUser(email, password);
    verificationLink = await generateVerificationLink(email);
  }

  // Fallback: generate our own verification link if Firebase is not configured
  if (!verificationLink) {
    const requestOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || requestOrigin || 'http://localhost:3000';
    verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;
  }

  // Send the verification email
  await sendVerificationEmail(email, verificationLink, fullName);

  res.status(201).json({
    success: true,
    message: 'Verification email sent. Please check your inbox to verify your email before proceeding to payment.',
    tenant: { id: tenant.id, name: tenant.name },
    user: { id: user.id, email: user.email, role: user.role, fullName: user.full_name, companyRole: user.company_role },
  });
});

// ── VERIFY EMAIL ──
// Handles both Firebase verification callback and custom token verification.
router.get('/verify-email', async (req, res) => {
  const { token, email, oobCode } = req.query;
  const requestOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || requestOrigin || 'http://localhost:3000';

  try {
    let verifiedEmail = null;

    if (oobCode && isFirebaseAvailable()) {
      // Firebase verification — the oobCode is handled by Firebase's client SDK
      // We check if the user's email is verified in Firebase
      if (email) {
        const verified = await isEmailVerified(email);
        if (verified) {
          verifiedEmail = email;
        }
      }
    }

    if (!verifiedEmail && token && email) {
      // Custom token verification
      const userResult = await query(
        'SELECT id, tenant_id, email, role, full_name, company_role FROM users WHERE email = $1 AND email_verification_token = $2',
        [decodeURIComponent(email), token]
      );
      const user = userResult.rows[0];
      if (user) {
        verifiedEmail = user.email;
      }
    }

    if (!verifiedEmail) {
      return res.redirect(`${frontendUrl}/signup?error=invalid_verification`);
    }

    // Mark user as verified
    await query(
      'UPDATE users SET email_verified = true, email_verification_token = NULL WHERE email = $1',
      [verifiedEmail]
    );

    // Get user details for JWT
    const userResult = await query(
      'SELECT id, tenant_id, email, role, full_name, company_role FROM users WHERE email = $1',
      [verifiedEmail]
    );
    const user = userResult.rows[0];

    // Get tenant subscription info
    const tenantResult = await query(
      'SELECT subscription_plan, subscription_status FROM tenants WHERE id = $1',
      [user.tenant_id]
    );
    const tenant = tenantResult.rows[0];

    // Generate JWT for the subscribe page
    const secret = process.env.JWT_SECRET || 'default_fallback_jwt_secret_key_change_in_production';
    const jwtToken = jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
        email: user.email,
        subscriptionPlan: tenant?.subscription_plan || 'none',
        subscriptionStatus: tenant?.subscription_status || 'pending_verification',
      },
      secret,
      { expiresIn: '1h' } // Short-lived token for payment flow
    );

    // Redirect to subscribe page with token
    return res.redirect(`${frontendUrl}/subscribe?token=${jwtToken}`);
  } catch (err) {
    console.error('Email verification error:', err);
    return res.redirect(`${frontendUrl}/signup?error=verification_failed`);
  }
});

// ── RESEND VERIFICATION EMAIL ──
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const userResult = await query(
    'SELECT id, email, email_verified, full_name FROM users WHERE email = $1',
    [email]
  );
  const user = userResult.rows[0];

  if (!user) {
    // Don't reveal if user exists
    return res.json({ success: true, message: 'If an account exists with this email, a verification email has been sent.' });
  }

  if (user.email_verified) {
    return res.json({ success: true, message: 'Email is already verified.' });
  }

  // Rate limit: don't resend within 60 seconds
  const sentAtResult = await query(
    'SELECT email_verification_sent_at FROM users WHERE email = $1',
    [email]
  );
  const lastSent = sentAtResult.rows[0]?.email_verification_sent_at;
  if (lastSent && (Date.now() - new Date(lastSent).getTime()) < 60000) {
    return res.status(429).json({ error: 'Please wait 60 seconds before requesting another verification email.' });
  }

  // Generate new token
  const verificationToken = uuidv4();
  await query(
    'UPDATE users SET email_verification_token = $1, email_verification_sent_at = NOW() WHERE email = $2',
    [verificationToken, email]
  );

  let verificationLink = null;

  if (isFirebaseAvailable()) {
    verificationLink = await generateVerificationLink(email);
  }

  if (!verificationLink) {
    const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
    verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;
  }

  const emailResult = await sendVerificationEmail(email, verificationLink, user.full_name);

  res.json({
    success: true,
    message: emailResult.success ? 'Verification email sent.' : 'Verification link generated.',
    ...((!emailResult.success || process.env.NODE_ENV !== 'production' || process.env.SHOW_VERIFICATION_LINK === 'true') && { _devVerificationLink: verificationLink }),
  });
});

// ── SUBSCRIPTION STATUS (Authenticated) ──
router.get('/subscription-status', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;

  const result = await query(
    `SELECT subscription_plan, subscription_status, trial_ends_at, subscription_updated_at
     FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const tenant = result.rows[0];

  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found.' });
  }

  res.json({
    plan: tenant.subscription_plan,
    status: tenant.subscription_status,
    trialEndsAt: tenant.trial_ends_at,
    updatedAt: tenant.subscription_updated_at,
  });
});

// ── LOGIN ──
// Modified: includes subscription info in JWT and response.
// Rejects login if email is not verified.
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

  // Check email verification
  if (!user.email_verified) {
    // Sync with Firebase to check if user verified via Firebase email link
    let firebaseVerified = false;
    try {
      if (isFirebaseAvailable()) {
        firebaseVerified = await isEmailVerified(user.email);
      }
    } catch (fbErr) {
      console.warn('Firebase email verification sync check error:', fbErr.message);
    }

    if (firebaseVerified) {
      await query('UPDATE users SET email_verified = true, email_verification_token = NULL WHERE id = $1', [user.id]);
      user.email_verified = true;
    } else {
      return res.status(403).json({
        error: 'Please verify your email before signing in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }
  }

  // Get tenant subscription info
  const tenantResult = await query(
    'SELECT subscription_plan, subscription_status, trial_ends_at FROM tenants WHERE id = $1',
    [user.tenant_id]
  );
  const tenant = tenantResult.rows[0];

  // Check subscription status — if pending, redirect to payment
  if (tenant?.subscription_status === 'pending_verification' || tenant?.subscription_plan === 'none') {
    // User verified email but hasn't completed payment
    const secret = process.env.JWT_SECRET || 'default_fallback_jwt_secret_key_change_in_production';
    const tempToken = jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
        email: user.email,
        subscriptionPlan: 'none',
        subscriptionStatus: tenant?.subscription_status || 'pending_verification',
      },
      secret,
      { expiresIn: '1h' }
    );

    return res.status(402).json({
      error: 'Please complete your subscription to access the platform.',
      code: 'SUBSCRIPTION_REQUIRED',
      redirectTo: `/subscribe?token=${tempToken}`,
    });
  }

  // Safe fallback for JWT secrets
  const secret = process.env.JWT_SECRET || 'default_fallback_jwt_secret_key_change_in_production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  // Create JWT token with subscription info
  const token = jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
      subscriptionPlan: tenant?.subscription_plan || 'none',
      subscriptionStatus: tenant?.subscription_status || 'pending_verification',
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
      companyRole: user.company_role,
      subscriptionPlan: tenant?.subscription_plan || 'none',
      subscriptionStatus: tenant?.subscription_status || 'pending_verification',
    }
  });
});

module.exports = router;
