// src/routes/paddle.js
// Paddle webhook handler — receives subscription lifecycle events.
// IMPORTANT: This route must be registered BEFORE express.json() middleware,
// because Paddle webhook signature verification requires the raw request body.

const express = require('express');
const router = express.Router();
const { Paddle } = require('@paddle/paddle-node-sdk');
const { query } = require('../db');

// Initialize Paddle SDK
const paddle = new Paddle(process.env.PADDLE_API_KEY || 'placeholder_key');

// Price ID → Plan mapping (loaded from env vars)
const PRICE_TO_PLAN = {
  [process.env.PADDLE_PRICE_ID_BASIC]: 'basic',
  [process.env.PADDLE_PRICE_ID_PRO]: 'pro',
  [process.env.PADDLE_PRICE_ID_ENTERPRISE]: 'enterprise',
};

/**
 * POST /api/paddle/webhook
 * Receives Paddle webhook events with raw body for signature verification.
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['paddle-signature'];
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('❌ PADDLE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    const rawBody = req.body.toString();
    event = paddle.webhooks.unmarshal(rawBody, webhookSecret, signature);
  } catch (err) {
    console.error('❌ Paddle webhook signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  console.log(`📦 Paddle webhook received: ${event.eventType}`);

  try {
    switch (event.eventType) {
      case 'subscription.created':
        await handleSubscriptionCreated(event.data);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(event.data);
        break;

      case 'subscription.canceled':
        await handleSubscriptionCanceled(event.data);
        break;

      case 'subscription.past_due':
        await handleSubscriptionPastDue(event.data);
        break;

      case 'subscription.paused':
        await handleSubscriptionPaused(event.data);
        break;

      case 'subscription.resumed':
        await handleSubscriptionResumed(event.data);
        break;

      case 'transaction.completed':
        console.log(`✅ Transaction completed: ${event.data.id}`);
        break;

      default:
        console.log(`ℹ️ Unhandled Paddle event: ${event.eventType}`);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error(`❌ Error processing Paddle webhook ${event.eventType}:`, err);
    // Still return 200 to prevent Paddle from retrying
    res.status(200).send('Processed with errors');
  }
});

// ── Event Handlers ──

async function handleSubscriptionCreated(data) {
  const { id: subscriptionId, customerId, customData, items, status, currentBillingPeriod } = data;

  // Extract tenantId from custom data (passed during checkout)
  const tenantId = customData?.tenantId;
  if (!tenantId) {
    console.error('❌ subscription.created missing tenantId in customData');
    return;
  }

  // Determine plan from the first item's price ID
  const priceId = items?.[0]?.price?.id;
  const plan = PRICE_TO_PLAN[priceId] || 'basic';

  // Determine subscription status
  const subStatus = status === 'trialing' ? 'trialing' : 'active';

  // Calculate trial end date if trialing
  const trialEndsAt = currentBillingPeriod?.startsAt || null;

  await query(
    `UPDATE tenants 
     SET subscription_plan = $1, 
         subscription_status = $2, 
         paddle_subscription_id = $3, 
         paddle_customer_id = $4,
         trial_ends_at = $5,
         subscription_updated_at = NOW()
     WHERE id = $6`,
    [plan, subStatus, subscriptionId, customerId, trialEndsAt, tenantId]
  );

  console.log(`✅ Subscription created: tenant=${tenantId} plan=${plan} status=${subStatus}`);
}

async function handleSubscriptionUpdated(data) {
  const { id: subscriptionId, items, status } = data;

  // Find the tenant by paddle_subscription_id
  const tenantResult = await query(
    'SELECT id FROM tenants WHERE paddle_subscription_id = $1',
    [subscriptionId]
  );
  const tenant = tenantResult.rows[0];
  if (!tenant) {
    console.error(`❌ subscription.updated: no tenant found for subscription ${subscriptionId}`);
    return;
  }

  // Determine updated plan
  const priceId = items?.[0]?.price?.id;
  const plan = PRICE_TO_PLAN[priceId];

  // Map Paddle status to our status
  const statusMap = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    paused: 'paused',
    canceled: 'canceled',
  };
  const subStatus = statusMap[status] || 'active';

  const updates = [];
  const params = [];
  let paramIdx = 1;

  if (plan) {
    updates.push(`subscription_plan = $${paramIdx++}`);
    params.push(plan);
  }
  updates.push(`subscription_status = $${paramIdx++}`);
  params.push(subStatus);
  updates.push(`subscription_updated_at = NOW()`);

  params.push(tenant.id);

  await query(
    `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
    params
  );

  console.log(`✅ Subscription updated: tenant=${tenant.id} plan=${plan || 'unchanged'} status=${subStatus}`);
}

async function handleSubscriptionCanceled(data) {
  const { id: subscriptionId } = data;

  await query(
    `UPDATE tenants 
     SET subscription_status = 'canceled', subscription_updated_at = NOW()
     WHERE paddle_subscription_id = $1`,
    [subscriptionId]
  );

  console.log(`⚠️ Subscription canceled: ${subscriptionId}`);
}

async function handleSubscriptionPastDue(data) {
  const { id: subscriptionId } = data;

  await query(
    `UPDATE tenants 
     SET subscription_status = 'past_due', subscription_updated_at = NOW()
     WHERE paddle_subscription_id = $1`,
    [subscriptionId]
  );

  console.log(`⚠️ Subscription past due: ${subscriptionId}`);
}

async function handleSubscriptionPaused(data) {
  const { id: subscriptionId } = data;

  await query(
    `UPDATE tenants 
     SET subscription_status = 'paused', subscription_updated_at = NOW()
     WHERE paddle_subscription_id = $1`,
    [subscriptionId]
  );

  console.log(`⏸️ Subscription paused: ${subscriptionId}`);
}

async function handleSubscriptionResumed(data) {
  const { id: subscriptionId } = data;

  await query(
    `UPDATE tenants 
     SET subscription_status = 'active', subscription_updated_at = NOW()
     WHERE paddle_subscription_id = $1`,
    [subscriptionId]
  );

  console.log(`▶️ Subscription resumed: ${subscriptionId}`);
}

module.exports = router;
