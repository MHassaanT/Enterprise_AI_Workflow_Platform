// src/middleware/subscriptionGuard.js
// Middleware to enforce subscription plan gating on agent-specific routes.
// Checks that the tenant's subscription is active/trialing AND
// that the requested agent route is included in their plan.

const { query } = require('../db');

// Plan → accessible route prefixes
const PLAN_AGENT_ACCESS = {
  basic: ['/chat', '/hr', '/pm'],
  pro: ['/chat', '/hr', '/pm', '/coding', '/workflows'],
  enterprise: ['/chat', '/hr', '/pm', '/coding', '/workflows', '/sales', '/procurement', '/finance', '/analytics'],
};

/**
 * Creates a subscription guard middleware for a specific agent route prefix.
 * @param {string} agentRouteKey - The key used to match in PLAN_AGENT_ACCESS (e.g., '/sales')
 */
function requirePlanAccess(agentRouteKey) {
  return async (req, res, next) => {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      const result = await query(
        'SELECT subscription_plan, subscription_status, trial_ends_at FROM tenants WHERE id = $1',
        [tenantId]
      );

      const tenant = result.rows[0];
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found.' });
      }

      // Check subscription is active or trialing
      const activeStatuses = ['active', 'trialing'];
      if (!activeStatuses.includes(tenant.subscription_status)) {
        // Check if trial has expired
        if (tenant.subscription_status === 'trialing' && tenant.trial_ends_at) {
          const trialEnd = new Date(tenant.trial_ends_at);
          if (trialEnd < new Date()) {
            return res.status(403).json({
              error: 'Your free trial has expired. Please subscribe to continue using this feature.',
              code: 'TRIAL_EXPIRED',
            });
          }
        }

        return res.status(403).json({
          error: 'Active subscription required to access this feature.',
          code: 'SUBSCRIPTION_REQUIRED',
          subscriptionStatus: tenant.subscription_status,
        });
      }

      // Check plan includes this agent
      const plan = tenant.subscription_plan;
      const accessibleRoutes = PLAN_AGENT_ACCESS[plan] || [];

      if (!accessibleRoutes.includes(agentRouteKey)) {
        return res.status(403).json({
          error: `Your current plan (${plan}) does not include access to this feature. Please upgrade your plan.`,
          code: 'PLAN_UPGRADE_REQUIRED',
          currentPlan: plan,
        });
      }

      // Attach subscription info to request for downstream use
      req.subscription = {
        plan: tenant.subscription_plan,
        status: tenant.subscription_status,
      };

      next();
    } catch (err) {
      console.error('Subscription guard error:', err);
      return res.status(500).json({ error: 'Failed to verify subscription status.' });
    }
  };
}

module.exports = { requirePlanAccess };
