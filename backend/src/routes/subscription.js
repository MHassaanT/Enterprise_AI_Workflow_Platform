// src/routes/subscription.js
// Subscription management routes — plan changes, cancellation, billing info.
// All routes require authentication.

const express = require('express');
const router = express.Router();
const { Paddle } = require('@paddle/paddle-node-sdk');
const { authenticate } = require('../middleware/auth');
const { query } = require('../db');

// Initialize Paddle SDK
const paddleEnv = process.env.PADDLE_ENVIRONMENT === 'production' ? undefined : 'sandbox';
const paddle = new Paddle(process.env.PADDLE_API_KEY || 'placeholder_key', {
  environment: paddleEnv,
});

// Price ID → Plan mapping
const PRICE_TO_PLAN = {
  [process.env.PADDLE_PRICE_ID_BASIC]: 'basic',
  [process.env.PADDLE_PRICE_ID_PRO]: 'pro',
  [process.env.PADDLE_PRICE_ID_ENTERPRISE]: 'enterprise',
};

// Plan → Price ID reverse mapping
const PLAN_TO_PRICE = {
  basic: process.env.PADDLE_PRICE_ID_BASIC,
  pro: process.env.PADDLE_PRICE_ID_PRO,
  enterprise: process.env.PADDLE_PRICE_ID_ENTERPRISE,
};

/**
 * GET /api/subscription/status
 * Returns the current tenant's subscription details.
 */
router.get('/status', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;

  const result = await query(
    `SELECT subscription_plan, subscription_status, paddle_subscription_id, 
            paddle_customer_id, trial_ends_at, subscription_updated_at
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
    paddleSubscriptionId: tenant.paddle_subscription_id,
    paddleCustomerId: tenant.paddle_customer_id,
    trialEndsAt: tenant.trial_ends_at,
    updatedAt: tenant.subscription_updated_at,
  });
});

/**
 * POST /api/subscription/change-plan
 * Update the subscription to a different plan via Paddle API.
 * Body: { newPlan: 'basic' | 'pro' | 'enterprise' }
 */
router.post('/change-plan', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  const { newPlan } = req.body;

  if (!newPlan || !PLAN_TO_PRICE[newPlan]) {
    return res.status(400).json({ error: 'Invalid plan. Must be basic, pro, or enterprise.' });
  }

  // Get current subscription
  const tenantResult = await query(
    'SELECT paddle_subscription_id, subscription_plan FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenant = tenantResult.rows[0];

  if (!tenant?.paddle_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found. Please subscribe first.' });
  }

  if (tenant.subscription_plan === newPlan) {
    return res.status(400).json({ error: `You are already on the ${newPlan} plan.` });
  }

  const newPriceId = PLAN_TO_PRICE[newPlan];

  try {
    // Update the subscription in Paddle
    const updatedSubscription = await paddle.subscriptions.update(tenant.paddle_subscription_id, {
      items: [{ priceId: newPriceId, quantity: 1 }],
      prorationBillingMode: 'prorated_immediately',
    });

    // Update local database immediately (webhook will also confirm)
    await query(
      `UPDATE tenants 
       SET subscription_plan = $1, subscription_updated_at = NOW()
       WHERE id = $2`,
      [newPlan, tenantId]
    );

    res.json({
      success: true,
      message: `Plan changed to ${newPlan}.`,
      plan: newPlan,
    });
  } catch (err) {
    console.error('Paddle plan change error:', err);
    res.status(500).json({ error: 'Failed to change plan. Please try again.' });
  }
});

/**
 * POST /api/subscription/cancel
 * Cancel the subscription at the end of the current billing period.
 */
router.post('/cancel', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;

  const tenantResult = await query(
    'SELECT paddle_subscription_id FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenant = tenantResult.rows[0];

  if (!tenant?.paddle_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found.' });
  }

  try {
    await paddle.subscriptions.cancel(tenant.paddle_subscription_id, {
      effectiveFrom: 'next_billing_period',
    });

    // Note: actual status change will be confirmed by webhook
    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period.',
    });
  } catch (err) {
    console.error('Paddle cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription. Please try again.' });
  }
});

/**
 * POST /api/subscription/resume
 * Resume a paused or canceled subscription.
 */
router.post('/resume', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;

  const tenantResult = await query(
    'SELECT paddle_subscription_id, subscription_status FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenant = tenantResult.rows[0];

  if (!tenant?.paddle_subscription_id) {
    return res.status(400).json({ error: 'No subscription found.' });
  }

  try {
    await paddle.subscriptions.update(tenant.paddle_subscription_id, {
      scheduledChange: null, // Removes any scheduled cancellation
    });

    await query(
      `UPDATE tenants 
       SET subscription_status = 'active', subscription_updated_at = NOW()
       WHERE id = $1`,
      [tenantId]
    );

    res.json({
      success: true,
      message: 'Subscription resumed successfully.',
    });
  } catch (err) {
    console.error('Paddle resume error:', err);
    res.status(500).json({ error: 'Failed to resume subscription. Please try again.' });
  }
});

/**
 * GET /api/subscription/update-payment-url
 * Returns a Paddle-hosted URL where the customer can update their payment method.
 */
router.get('/update-payment-url', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;

  const tenantResult = await query(
    'SELECT paddle_subscription_id FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenant = tenantResult.rows[0];

  if (!tenant?.paddle_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found.' });
  }

  try {
    const subscription = await paddle.subscriptions.get(tenant.paddle_subscription_id);

    // Paddle provides an update payment method URL on the subscription object
    const updateUrl = subscription.managementUrls?.updatePaymentMethod;

    if (!updateUrl) {
      return res.status(404).json({ error: 'Payment update URL not available.' });
    }

    res.json({ url: updateUrl });
  } catch (err) {
    console.error('Paddle update payment URL error:', err);
    res.status(500).json({ error: 'Failed to get payment update URL.' });
  }
});

module.exports = router;
