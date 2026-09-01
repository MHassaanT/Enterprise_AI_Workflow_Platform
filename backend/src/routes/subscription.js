const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../db');
const { safepay, getPlanId } = require('../services/safepay');

/**
 * GET /api/subscription/status
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    let tenantId = req.user?.tenantId || req.user?.tenant_id;

    if (!tenantId && req.user?.id) {
      const uRes = await query('SELECT tenant_id FROM users WHERE id = $1', [req.user.id]);
      tenantId = uRes.rows[0]?.tenant_id;
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found for user' });
    }
    
    const result = await query(
      `SELECT subscription_plan, subscription_status, payment_subscription_id,
              safepay_plan_id, trial_ends_at, subscription_ends_at,
              subscription_renews_at, billing_cycle, subscription_updated_at
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    
    const tenant = result.rows[0] || {};
    
    res.json({
      plan: tenant.subscription_plan || 'none',
      status: tenant.subscription_status || 'pending_verification',
      subscriptionId: tenant.payment_subscription_id || null,
      planId: tenant.safepay_plan_id || null,
      trialEndsAt: tenant.trial_ends_at || null,
      subscriptionEndsAt: tenant.subscription_ends_at || null,
      renewsAt: tenant.subscription_renews_at || null,
      billingCycle: tenant.billing_cycle || 'monthly',
      updatedAt: tenant.subscription_updated_at || null,
    });
  } catch (err) {
    console.error('Error in /api/subscription/status:', err);
    res.status(500).json({ error: 'Failed to load subscription status', details: err.message });
  }
});

/**
 * POST /api/subscription/change-plan
 * SafePay doesn't support native plan changes on subscriptions.
 * Cancel old subscription and create new checkout for new plan.
 */
router.post('/change-plan', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  const { newPlan, billingCycle = 'monthly' } = req.body;
  
  const tenantResult = await query(
    'SELECT payment_subscription_id, subscription_plan, billing_cycle FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenant = tenantResult.rows[0];
  
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  
  // Cancel existing SafePay subscription if present
  if (tenant.payment_subscription_id) {
    try {
      await safepay.subscription.cancel(tenant.payment_subscription_id);
    } catch (err) {
      console.error('SafePay cancel error:', err);
      // Continue even if cancel fails (subscription may already be expired)
    }
  }
  
  // Generate new checkout for the new plan
  const planId = getPlanId(newPlan, billingCycle);
  if (!planId) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  
  const reference = `${tenantId}-change-${Date.now()}`;
  
  const url = await safepay.checkout.createSubscription({
    planId,
    reference,
    cancelUrl: `${process.env.FRONTEND_URL}/payment/cancel`,
    redirectUrl: `${process.env.FRONTEND_URL}/payment/success`,
  });
  
  await query(
    `UPDATE tenants 
     SET subscription_plan = $1,
         billing_cycle = $2,
         safepay_plan_id = $3,
         safepay_reference = $4,
         subscription_status = 'trialing',
         subscription_updated_at = NOW()
     WHERE id = $5`,
    [newPlan, billingCycle, planId, reference, tenantId]
  );
  
  res.json({
    success: true,
    checkoutUrl: url,
    message: 'Please complete checkout to activate the new plan.',
  });
});

/**
 * POST /api/subscription/cancel
 */
router.post('/cancel', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  
  const tenantResult = await query(
    'SELECT payment_subscription_id FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenant = tenantResult.rows[0];
  
  if (tenant?.payment_subscription_id) {
    try {
      await safepay.subscription.cancel(tenant.payment_subscription_id);
    } catch (err) {
      console.error('SafePay cancel error:', err);
    }
  }
  
  await query(
    `UPDATE tenants 
     SET subscription_status = 'canceled',
         subscription_renews_at = NULL,
         subscription_updated_at = NOW()
     WHERE id = $1`,
    [tenantId]
  );
  
  res.json({
    success: true,
    message: 'Subscription canceled. Access continues until end of billing period.',
  });
});

/**
 * POST /api/subscription/pause
 */
router.post('/pause', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  
  const tenantResult = await query(
    'SELECT payment_subscription_id FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenant = tenantResult.rows[0];
  
  if (!tenant?.payment_subscription_id) {
    return res.status(400).json({ error: 'No active subscription to pause' });
  }
  
  await safepay.subscription.pause({
    subscriptionId: tenant.payment_subscription_id,
    behavior: 'MARK_UNCOLLECTIBLE', // or 'KEEP_AS_READY' / 'MARK_VOID'
  });
  
  await query(
    `UPDATE tenants 
     SET subscription_status = 'paused',
         subscription_updated_at = NOW()
     WHERE id = $1`,
    [tenantId]
  );
  
  res.json({ success: true, message: 'Subscription paused.' });
});

/**
 * POST /api/subscription/resume
 */
router.post('/resume', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  
  const tenantResult = await query(
    'SELECT payment_subscription_id FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenant = tenantResult.rows[0];
  
  if (!tenant?.payment_subscription_id) {
    return res.status(400).json({ error: 'No subscription to resume' });
  }
  
  await safepay.subscription.resume(tenant.payment_subscription_id);
  
  await query(
    `UPDATE tenants 
     SET subscription_status = 'active',
         subscription_updated_at = NOW()
     WHERE id = $1`,
    [tenantId]
  );
  
  res.json({ success: true, message: 'Subscription resumed.' });
});

module.exports = router;
