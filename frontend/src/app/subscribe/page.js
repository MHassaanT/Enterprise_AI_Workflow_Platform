'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    monthlyPrice: 5000,
    yearlyPrice: 55000,
    priceLabelMonthly: 'PKR 5,000',
    priceLabelYearly: 'PKR 55,000',
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
    monthlyPrice: 7500,
    yearlyPrice: 82500,
    priceLabelMonthly: 'PKR 7,500',
    priceLabelYearly: 'PKR 82,500',
    description: 'Advanced AI agents with enhanced capabilities',
    agents: ['Customer Support Agent', 'HR Agent', 'PM Agent', 'Sales Agent', 'Marketing Agent'],
    popular: true,
    color: 'from-violet-500/20 to-purple-500/20',
    borderColor: 'border-violet-500/40',
    accentColor: 'text-violet-400',
    icon: 'workspace_premium',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 11000,
    yearlyPrice: 121000,
    priceLabelMonthly: 'PKR 11,000',
    priceLabelYearly: 'PKR 121,000',
    description: 'Full suite with premium AI agents',
    agents: ['Customer Support Agent', 'HR Agent', 'PM Agent', 'Sales Agent', 'Marketing Agent', 'Finance Agent'],
    color: 'from-amber-500/20 to-orange-500/20',
    borderColor: 'border-amber-500/40',
    accentColor: 'text-amber-400',
    icon: 'corporate_fare',
  },
];

function SubscribePageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserInfo(payload);
        localStorage.setItem('ai_platform_token', token);
        localStorage.setItem('ai_platform_user', JSON.stringify({
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          tenantId: payload.tenantId,
        }));
      } catch (e) {
        console.error('Invalid token:', e);
      }
    } else {
      const storedUser = localStorage.getItem('ai_platform_user');
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          setUserInfo({
            userId: parsed.id,
            email: parsed.email,
            tenantId: parsed.tenantId,
          });
        } catch (e) {
          console.error('Error parsing stored user:', e);
        }
      }
    }
  }, [token]);

  const handleSelectPlan = useCallback(async (planId) => {
    setSelectedPlan(planId);
    setError(null);
    setCheckoutLoading(true);

    try {
      const authToken = localStorage.getItem('ai_platform_token');
      const res = await fetch('/api/safepay/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          plan: planId,
          billingCycle,
          tenantId: userInfo?.tenantId,
          userId: userInfo?.userId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout initialization failed');

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('SafePay checkout error:', err);
      setError(err.message || 'Failed to initiate SafePay checkout');
      setCheckoutLoading(false);
    }
  }, [billingCycle, userInfo]);

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Glow effects */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] bg-violet-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3 group mb-6">
            <div className="h-12 w-12 rounded-xl bg-primary-container/20 border border-primary/40 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-md">
              <span className="material-symbols-outlined text-3xl">hexagon</span>
            </div>
            <span className="font-display-lg text-2xl font-extrabold text-on-surface tracking-tight">Enterprise AI</span>
          </Link>
          <h1 className="text-4xl font-bold mb-3 text-on-surface">Choose Your Plan</h1>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            Select the plan that best fits your business needs. All plans include automated SafePay billing.
          </p>
          {userInfo?.email && (
            <p className="font-label-md text-xs text-on-surface-variant mt-3">
              Subscribing as <span className="text-primary font-semibold">{userInfo.email}</span>
            </p>
          )}
        </div>

        {/* Billing Cycle Toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-surface-container-high rounded-xl p-1.5 border border-outline-variant shadow-inner">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-lg font-label-md text-sm font-semibold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-5 py-2 rounded-lg font-label-md text-sm font-semibold transition-all flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Yearly Billing
              <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold">
                Save ~8%
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-8 p-4 bg-error-container/20 border border-error/40 rounded-xl text-error text-sm text-center flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-surface-container-low border ${plan.borderColor} rounded-2xl p-6 flex flex-col transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
                plan.popular ? 'ring-2 ring-primary/40' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-on-primary font-label-md text-xs font-bold rounded-full shadow-lg">
                  Most Popular
                </div>
              )}
              <div className={`absolute inset-0 bg-gradient-to-br ${plan.color} opacity-40 rounded-2xl pointer-events-none`} />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`material-symbols-outlined text-3xl ${plan.accentColor}`}>{plan.icon}</span>
                  <h2 className="text-2xl font-bold text-on-surface">{plan.name}</h2>
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold text-on-surface">
                    {billingCycle === 'yearly' ? plan.priceLabelYearly : plan.priceLabelMonthly}
                  </span>
                  <span className="text-on-surface-variant text-sm font-medium">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>
                </div>
                <p className="text-on-surface-variant text-sm mb-6">{plan.description}</p>
                <div className="flex-1">
                  <h3 className="font-semibold text-xs uppercase tracking-wider text-on-surface-variant mb-3">Included Agents:</h3>
                  <ul className="space-y-2">
                    {plan.agents.map((agent) => (
                      <li key={agent} className="flex items-center gap-2 text-sm text-on-surface">
                        <span className="material-symbols-outlined text-base text-emerald-400">check_circle</span>
                        {agent}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={checkoutLoading && selectedPlan === plan.id}
                  className={`mt-6 w-full py-3.5 px-6 rounded-xl font-label-md text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                    selectedPlan === plan.id && checkoutLoading
                      ? 'bg-surface-container-high text-on-surface-variant cursor-wait'
                      : 'bg-primary text-on-primary hover:bg-primary-container active:scale-[0.98] shadow-lg shadow-primary/20'
                  }`}
                >
                  {checkoutLoading && selectedPlan === plan.id ? (
                    <>
                      <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                      Redirecting to SafePay...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">lock</span>
                      Subscribe Now
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <div className="flex items-center justify-center gap-6 text-on-surface-variant font-label-md text-xs">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-emerald-400">verified_user</span>
              Secure Payment via SafePay
            </span>
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-emerald-400">sync</span>
              Auto-Renewal
            </span>
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-emerald-400">cancel</span>
              Cancel Anytime
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SubscribePageContent />
    </Suspense>
  );
}
