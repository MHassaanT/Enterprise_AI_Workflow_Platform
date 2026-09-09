const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { safepay, getPlanId } = require('../services/safepay');

/**
 * POST /api/safepay/checkout
 * Creates a SafePay subscription checkout URL
 */
router.post('/checkout', async (req, res) => {
  try {
    const body = req.body || {};
    const { plan, billingCycle = 'monthly', tenantId, userId } = body;
    
    if (!plan) {
      return res.status(400).json({ error: 'Plan parameter is required' });
    }

    const planId = getPlanId(plan, billingCycle);
    if (!planId) {
      console.warn(`[SafePay Checkout] Missing planId for plan '${plan}', cycle '${billingCycle}'. Check environment variables.`);
      return res.status(400).json({ error: `Invalid plan (${plan}) or billing cycle (${billingCycle})` });
    }

    // Generate a unique reference for reconciliation
    const reference = `${tenantId || 'unknown'}-${userId || 'unknown'}-${Date.now()}`;

    // Determine base frontend URL dynamically if FRONTEND_URL env is missing
    const rawOrigin = req.headers.origin || req.headers.referer;
    let baseUrl = process.env.FRONTEND_URL;
    if (!baseUrl && rawOrigin) {
      try {
        const parsed = new URL(rawOrigin);
        baseUrl = parsed.origin;
      } catch (e) {
        baseUrl = rawOrigin.replace(/\/$/, '');
      }
    }
    if (!baseUrl) {
      baseUrl = 'https://enterprise-ai-workflow-platform.vercel.app';
    }
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    const cancelUrl = `${cleanBaseUrl}/subscribe`;
    const redirectUrl = `${cleanBaseUrl}/login?payment=success`;

    const url = await safepay.checkout.createSubscription({
      planId,
      reference,
      cancelUrl,
      redirectUrl,
    });

    // Store pending subscription record (non-blocking for checkout session generation)
    if (tenantId) {
      try {
        await query(
          `UPDATE tenants 
           SET subscription_plan = $1,
               billing_cycle = $2,
               safepay_plan_id = $3,
               safepay_reference = $4,
               subscription_status = 'trialing',
               subscription_updated_at = NOW()
           WHERE id = $5`,
          [plan, billingCycle, planId, reference, tenantId]
        );
      } catch (dbErr) {
        console.warn('[SafePay Checkout] DB update warning:', dbErr.message);
      }
    }

    res.json({ checkoutUrl: url, reference });
  } catch (err) {
    console.error('SafePay checkout error details:', err?.response?.data || err.stack || err);
    res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
});

/**
 * POST /api/safepay/webhook
 * Handles SafePay webhook events
 * NOTE: Must use express.raw() or body-parser raw to preserve body bytes
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    let event = null;

    if (Buffer.isBuffer(req.body)) {
      try {
        event = JSON.parse(req.body.toString('utf8'));
      } catch (e) {
        console.error('[SafePay Webhook] Failed to parse Buffer as JSON:', e.message);
        return res.status(400).send('Invalid JSON payload');
      }
    } else if (typeof req.body === 'string') {
      try {
        event = JSON.parse(req.body);
      } catch (e) {
        console.error('[SafePay Webhook] Failed to parse String as JSON:', e.message);
        return res.status(400).send('Invalid JSON payload');
      }
    } else if (typeof req.body === 'object' && req.body !== null) {
      event = req.body;
    } else {
      console.error('[SafePay Webhook] Empty or invalid request body');
      return res.status(400).send('Empty body');
    }

    // Verify webhook signature using SDK helper
    // Note: @sfpy/node-sdk expects request.body.data to be present
    let valid = false;
    const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;
    const hasValidSecret = webhookSecret && webhookSecret !== 'dummy_webhook_secret';
    const signature = req.headers['x-sfpy-signature'];

    if (hasValidSecret && signature) {
      try {
        // Pass the parsed object with .data so Buffer.from(JSON.stringify(request.body.data)) inside SDK succeeds
        valid = safepay.verify.webhook({
          body: event,
          headers: req.headers,
        });
      } catch (sigErr) {
        console.error('[SafePay Webhook] Signature verification throw:', sigErr.message);
        valid = false;
      }

      if (!valid) {
        console.error('[SafePay Webhook] Signature verification failed');
        return res.status(401).send('Invalid signature');
      }
    } else {
      if (process.env.NODE_ENV === 'production' && !signature) {
        console.warn('[SafePay Webhook] Missing x-sfpy-signature header in production');
      } else {
        console.log('[SafePay Webhook] Signature check bypassed (development/sandbox or unconfigured webhook secret)');
      }
    }

    // Acknowledge immediately
    res.status(200).send('OK');

    // Process asynchronously
    const eventType = event.type;
    const data = event.data || {};

    // Idempotency check
    if (event.id) {
      const existing = await query(
        'SELECT id FROM webhook_events WHERE event_id = $1',
        [event.id]
      );
      if (existing.rows.length > 0) {
        console.log(`[SafePay Webhook] Duplicate event ignored: ${event.id}`);
        return;
      }

      await query(
        `INSERT INTO webhook_events (event_id, event_type, payload)
         VALUES ($1, $2, $3)`,
        [event.id, eventType, JSON.stringify(data)]
      );
    }

    switch (eventType) {
      case 'payment.completed':
      case 'payment.created':
      case 'payment.succeeded':
      case 'subscription.payment.succeeded':
      case 'subscription.created':
        await handlePaymentCompleted(data);
        break;
      case 'payment.failed':
      case 'subscription.payment.failed':
        await handlePaymentFailed(data);
        break;
      case 'payment.refunded':
      case 'subscription.canceled':
        await handlePaymentRefunded(data);
        break;
      default:
        console.log(`Unhandled SafePay event: ${eventType}`);
    }
  } catch (err) {
    console.error('SafePay webhook error:', err);
    res.status(200).send('OK'); // Always return 200 to prevent retries on parse errors
  }
});

async function handlePaymentCompleted(data) {
  const reference = data.reference || data.tracker || data.payment?.reference || data.subscription?.reference || data.metadata?.reference;
  const subscriptionId = typeof data.subscription === 'object'
    ? (data.subscription?.token || data.subscription?.id)
    : (data.subscription || data.subscription_id || data.token || data.id);

  if (!reference) {
    console.warn('[SafePay Webhook] No reference found in payload:', JSON.stringify(data));
    return;
  }

  // Find tenant by safepay_reference or prefix match
  let tenantResult = await query(
    'SELECT id, subscription_plan, billing_cycle FROM tenants WHERE safepay_reference = $1',
    [reference]
  );

  // Fallback: If reference was constructed as `${tenantId}-${userId}-${timestamp}`, try extracting tenantId
  if (tenantResult.rows.length === 0) {
    const parts = reference.split('-');
    if (parts.length >= 5) {
      const potentialTenantId = parts.slice(0, 5).join('-');
      tenantResult = await query(
        'SELECT id, subscription_plan, billing_cycle FROM tenants WHERE id = $1',
        [potentialTenantId]
      );
    }
  }

  if (tenantResult.rows.length === 0) {
    console.warn(`[SafePay Webhook] No matching tenant found for reference: ${reference}`);
    return;
  }

  const tenant = tenantResult.rows[0];
  const now = new Date();
  const endsAt = new Date(now);
  if (tenant.billing_cycle === 'yearly') {
    endsAt.setFullYear(endsAt.getFullYear() + 1);
  } else {
    endsAt.setMonth(endsAt.getMonth() + 1);
  }

  await query(
    `UPDATE tenants 
     SET subscription_status = 'active',
         payment_subscription_id = COALESCE($1, payment_subscription_id),
         subscription_started_at = COALESCE(subscription_started_at, $2),
         subscription_ends_at = $3,
         subscription_renews_at = $3,
         last_payment_at = $2,
         subscription_updated_at = $2
     WHERE id = $4`,
    [
      subscriptionId || null,
      now,
      endsAt,
      tenant.id
    ]
  );

  // Auto-verify all users for this active tenant
  await query(
    `UPDATE users SET email_verified = true, email_verification_token = NULL WHERE tenant_id = $1`,
    [tenant.id]
  );

  console.log(`[SafePay] Subscription activated/renewed: tenant=${tenant.id}`);
}

async function handlePaymentFailed(data) {
  const reference = data.reference || data.tracker || data.payment?.reference || data.subscription?.reference;
  if (!reference) return;

  await query(
    `UPDATE tenants 
     SET subscription_status = 'past_due',
         subscription_updated_at = NOW()
     WHERE (safepay_reference = $1 OR id::text = $1) AND subscription_status = 'active'`,
    [reference]
  );
}

async function handlePaymentRefunded(data) {
  const reference = data.reference || data.tracker || data.payment?.reference || data.subscription?.reference;
  if (!reference) return;

  await query(
    `UPDATE tenants 
     SET subscription_status = 'canceled',
         subscription_updated_at = NOW()
     WHERE safepay_reference = $1 OR id::text = $1`,
    [reference]
  );
}

module.exports = router;
