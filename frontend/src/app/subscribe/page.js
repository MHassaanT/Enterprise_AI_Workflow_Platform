'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { initializePaddle } from '@paddle/paddle-js';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 50,
    priceLabel: '$50',
    description: 'Essential AI agents for small teams',
    agents: ['Customer Support Agent', 'HR Agent', 'PM Agent'],
    color: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-500/40',
    accentColor: 'text-blue-400',
    icon: 'rocket_launch',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 75,
    priceLabel: '$75',
    description: 'Advanced automation & developer tools',
    agents: ['Everything in Basic', 'Coding Agent', 'Workflow Builder Agent'],
    popular: true,
    color: 'from-primary/20 to-violet-500/20',
    borderColor: 'border-primary/50',
    accentColor: 'text-primary',
    icon: 'auto_awesome',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 110,
    priceLabel: '$110',
    description: 'Full AI workforce for enterprise operations',
    agents: ['Everything in Pro', 'Sales Agent', 'Procurement Agent', 'Finance Agent', 'Analytics Agent'],
    color: 'from-amber-500/20 to-orange-500/20',
    borderColor: 'border-amber-500/40',
    accentColor: 'text-amber-400',
    icon: 'corporate_fare',
  },
];

// Env-driven price IDs — these are loaded at build time from NEXT_PUBLIC_ vars
const PRICE_IDS = {
  basic: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_BASIC || '',
  pro: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO || '',
  enterprise: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_ENTERPRISE || '',
};

function SubscribePageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [paddle, setPaddle] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userInfo, setUserInfo] = useState(null);

  // Parse JWT to get user info (without verifying — just for display)
  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserInfo(payload);
        // Store token for auth
        localStorage.setItem('ai_platform_token', token);
        localStorage.setItem('ai_platform_user', JSON.stringify({
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          tenantId: payload.tenantId,
          subscriptionPlan: payload.subscriptionPlan,
          subscriptionStatus: payload.subscriptionStatus,
        }));
      } catch (e) {
        console.error('Invalid token:', e);
      }
    }
  }, [token]);

  // Initialize Paddle
  useEffect(() => {
    const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!clientToken) {
      console.warn('Paddle client token not configured');
      return;
    }

    initializePaddle({
      token: clientToken,
      environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      eventCallback: (event) => {
        if (event.name === 'checkout.completed') {
          // Payment successful — redirect to dashboard
          window.location.href = '/dashboard';
        }
        if (event.name === 'checkout.closed') {
          setCheckoutLoading(false);
        }
      },
    }).then((paddleInstance) => {
      setPaddle(paddleInstance);
    }).catch((err) => {
      console.error('Paddle initialization failed:', err);
    });
  }, []);

  const handleSelectPlan = useCallback((planId) => {
    setSelectedPlan(planId);
    setError(null);
    setCheckoutLoading(true);

    const priceId = PRICE_IDS[planId];
    if (!priceId) {
      setError('Plan price not configured. Please contact support.');
      setCheckoutLoading(false);
      return;
    }

    if (!paddle) {
      setError('Payment system is initializing. Please try again in a moment.');
      setCheckoutLoading(false);
      return;
    }

    try {
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: {
          email: userInfo?.email || '',
        },
        customData: {
          tenantId: userInfo?.tenantId || '',
          userId: userInfo?.userId || '',
        },
      });
    } catch (err) {
      console.error('Checkout open error:', err);
      setError('Failed to open checkout. Please try again.');
      setCheckoutLoading(false);
    }
  }, [paddle, userInfo]);

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/8 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] bg-violet-500/8 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="max-w-5xl w-full mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/" className="inline-flex items-center gap-3 group mb-6">
            <div className="h-12 w-12 rounded-xl bg-primary-container/20 border border-primary/40 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-md">
              <span className="material-symbols-outlined text-3xl">hexagon</span>
            </div>
            <span className="font-display-lg text-2xl font-extrabold text-on-surface tracking-tight">Enterprise AI</span>
          </Link>
          <h1 className="font-display-lg text-4xl font-extrabold text-on-surface mb-3">
            Choose Your Plan
          </h1>
          <p className="font-body-md text-on-surface-variant max-w-xl mx-auto">
            Start with a <span className="text-primary font-semibold">7-day free trial</span> on any plan. No charge until your trial ends. Cancel anytime.
          </p>
          {userInfo?.email && (
            <p className="font-label-md text-xs text-on-surface-variant mt-3">
              Subscribing as <span className="text-primary font-semibold">{userInfo.email}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-8 p-4 rounded-xl bg-error-container/20 border border-error/40 text-error font-label-md text-sm flex items-center gap-3">
            <span className="material-symbols-outlined text-xl shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-surface-container-low border rounded-2xl p-6 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${
                plan.popular ? 'border-primary/50 ring-1 ring-primary/20' : 'border-outline-variant'
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-on-primary font-label-md text-xs font-bold rounded-full shadow-lg shadow-primary/30">
                  Most Popular
                </div>
              )}

              {/* Plan Header */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} border ${plan.borderColor} flex items-center justify-center mb-4`}>
                <span className={`material-symbols-outlined text-2xl ${plan.accentColor}`}>{plan.icon}</span>
              </div>

              <h3 className="font-headline-md text-xl font-bold text-on-surface mb-1">{plan.name}</h3>
              <p className="font-body-md text-xs text-on-surface-variant mb-4">{plan.description}</p>

              {/* Price */}
              <div className="flex items-baseline gap-1 mb-6">
                <span className="font-display-lg text-4xl font-extrabold text-on-surface">{plan.priceLabel}</span>
                <span className="font-body-md text-sm text-on-surface-variant">/ month</span>
              </div>

              {/* Agent List */}
              <div className="space-y-2 mb-6">
                <p className="font-label-md text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Included Agents:</p>
                {plan.agents.map((agent, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-sm ${plan.accentColor}`}>
                      {agent.startsWith('Everything') ? 'expand_circle_right' : 'check_circle'}
                    </span>
                    <span className="font-body-md text-sm text-on-surface">{agent}</span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handleSelectPlan(plan.id)}
                disabled={checkoutLoading && selectedPlan === plan.id}
                className={`w-full py-3.5 font-label-md text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  plan.popular
                    ? 'bg-primary hover:bg-primary-container text-on-primary shadow-lg shadow-primary/20'
                    : 'bg-surface-container-high border border-outline-variant text-on-surface hover:bg-surface-container-highest'
                } disabled:opacity-50`}
              >
                {checkoutLoading && selectedPlan === plan.id ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                    Opening Checkout...
                  </>
                ) : (
                  <>
                    <span>Start 7-Day Free Trial</span>
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div className="text-center mt-10 space-y-3">
          <div className="flex items-center justify-center gap-6 text-on-surface-variant">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-emerald-400">verified_user</span>
              <span className="font-label-md text-xs">Secure Payment via Paddle</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">credit_card_off</span>
              <span className="font-label-md text-xs">Cancel Anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-amber-400">group</span>
              <span className="font-label-md text-xs">Covers Entire Team</span>
            </div>
          </div>
          <p className="font-body-md text-xs text-on-surface-variant">
            All plans include a 7-day free trial. Your card will not be charged until the trial period ends.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-on-surface-variant">Loading...</div>
      </div>
    }>
      <SubscribePageContent />
    </Suspense>
  );
}
