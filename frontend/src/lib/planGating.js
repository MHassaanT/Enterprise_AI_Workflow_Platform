// src/lib/planGating.js
// Subscription plan → agent access configuration.
// Controls which agents are visible in the sidebar and accessible via routes.

/**
 * Maps each subscription plan to the set of agent routes it unlocks.
 * Non-agent routes (dashboard, approvals, widget-setup, mcp, admin, users, billing)
 * are always accessible regardless of plan.
 */
export const PLAN_AGENT_ACCESS = {
  basic: ['/chat', '/hr', '/pm'],
  pro: ['/chat', '/hr', '/pm', '/coding', '/admin/workflows'],
  enterprise: ['/chat', '/hr', '/pm', '/coding', '/admin/workflows', '/sales', '/procurement', '/finance', '/analytics'],
};

/**
 * Routes that are always accessible regardless of plan.
 * These are infrastructure/management pages, not agent-specific.
 */
export const ALWAYS_ACCESSIBLE_ROUTES = [
  '/dashboard',
  '/onboard',
  '/approvals',
  '/widget-setup',
  '/mcp',
  '/admin/tools',
  '/users',
  '/billing',
  '/subscribe',
  '/attendance',
];

/**
 * Agent sidebar nav items keyed by their route prefix.
 * Used to filter the sidebar based on plan.
 */
export const AGENT_ROUTES = [
  '/chat',
  '/hr',
  '/pm',
  '/coding',
  '/admin/workflows',
  '/sales',
  '/procurement',
  '/finance',
  '/analytics',
];

/**
 * Get the list of accessible agent routes for a given plan.
 * @param {string} plan - 'basic' | 'pro' | 'enterprise' | 'none'
 * @returns {string[]} Array of accessible route prefixes
 */
export function getAccessibleAgents(plan) {
  if (!plan || plan === 'none') return [];
  return PLAN_AGENT_ACCESS[plan] || [];
}

/**
 * Check if a specific route is accessible for the given plan.
 * @param {string} plan - The subscription plan
 * @param {string} pathname - The current route pathname
 * @returns {boolean} Whether the route is accessible
 */
export function canAccessRoute(plan, pathname) {
  // Public pages always accessible
  if (pathname === '/' || pathname === '/login' || pathname === '/signup') return true;

  // Always-accessible infrastructure routes
  if (ALWAYS_ACCESSIBLE_ROUTES.some(route => pathname.startsWith(route))) return true;

  // Check if it's an agent route
  const isAgentRoute = AGENT_ROUTES.some(route => pathname.startsWith(route));
  if (!isAgentRoute) return true; // Non-agent route, allow

  // Check plan access
  const accessibleAgents = getAccessibleAgents(plan);
  return accessibleAgents.some(route => pathname.startsWith(route));
}
