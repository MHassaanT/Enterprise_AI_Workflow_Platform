'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import { getUser, getAuthHeader } from '@/lib/api';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    monthlyPrice: '$50/mo',
    yearlyPrice: '$550/yr',
    agents: ['Customer Support Agent', 'HR Agent', 'PM Agent'],
    icon: 'rocket_launch',
    color: 'blue',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: '$75/mo',
    yearlyPrice: '$825/yr',
    agents: ['Customer Support Agent', 'HR Agent', 'PM Agent', 'Sales Agent', 'Marketing Agent'],
    icon: 'workspace_premium',
    color: 'violet',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: '$110/mo',
    yearlyPrice: '$1,210/yr',
    agents: ['Customer Support Agent', 'HR Agent', 'PM Agent', 'Sales Agent', 'Marketing Agent', 'Finance Agent'],
    icon: 'corporate_fare',
    color: 'amber',
  },
];

const STATUS_LABELS = {
  active: { text: 'Active', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' },
  trialing: { text: 'Free Trial', color: 'text-blue-400 bg-blue-950/40 border-blue-800/50' },
  past_due: { text: 'Past Due', color: 'text-error bg-error-container/20 border-error/30' },
  canceled: { text: 'Canceled', color: 'text-on-surface-variant bg-surface-container border-outline-variant' },
  paused: { text: 'Paused', color: 'text-amber-400 bg-amber-950/40 border-amber-800/50' },
  pending_verification: { text: 'Pending', color: 'text-on-surface-variant bg-surface-container border-outline-variant' },
};

export default function BillingPage() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getUser());
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/subscription/status', {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error('Failed to load subscription status');
      const data = await res.json();
      setSubscription(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (newPlan) => {
    setActionLoading(newPlan);
    setError(null);
    setSuccess(null);

    try {
      const billingCycle = subscription?.billingCycle || 'monthly';
      const res = await fetch('/api/subscription/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ newPlan, billingCycle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change plan');

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setSuccess(data.message || 'Plan changed successfully.');

      const currentUser = getUser();
      if (currentUser) {
        currentUser.subscriptionPlan = newPlan;
        localStorage.setItem('ai_platform_user', JSON.stringify(currentUser));
      }

      await loadSubscription();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async () => {
    setActionLoading('pause');
    setError(null);
    setSuccess(null);
    setShowPauseModal(false);

    try {
      const res = await fetch('/api/subscription/pause', {
        method: 'POST',
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to pause subscription');
      setSuccess(data.message || 'Subscription paused.');
      await loadSubscription();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    setActionLoading('resume');
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/subscription/resume', {
        method: 'POST',
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resume subscription');
      setSuccess(data.message || 'Subscription resumed.');
      await loadSubscription();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setActionLoading('cancel');
    setError(null);
    setSuccess(null);
    setShowCancelModal(false);

    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel subscription');
      setSuccess(data.message || 'Subscription canceled.');
      await loadSubscription();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const statusInfo = STATUS_LABELS[subscription?.status] || STATUS_LABELS.pending_verification;
  const isActive = subscription?.status === 'active';
  const isPaused = subscription?.status === 'paused';
  const isCanceled = subscription?.status === 'canceled';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <main className="max-w-4xl mx-auto px-6 py-12">
          {/* Header */}
          <header className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-primary text-2xl">payments</span>
              <h1 className="font-display-lg text-3xl font-extrabold text-on-surface">Billing & Subscription</h1>
            </div>
            <p className="font-body-md text-on-surface-variant">
              Manage your SafePay automated subscription plan, status, and billing lifecycle.
            </p>
          </header>

          {/* Alerts */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-error-container/20 border border-error/40 text-error font-label-md text-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-xl shrink-0">error</span>
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto"><span className="material-symbols-outlined text-sm">close</span></button>
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 font-label-md text-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-xl shrink-0">check_circle</span>
              <span>{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto"><span className="material-symbols-outlined text-sm">close</span></button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-20 text-on-surface-variant flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading billing information...</span>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Current Plan Overview */}
              <section className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-xl">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="font-headline-md text-xl font-bold text-on-surface">Current Plan</h2>
                      <span className={`px-3 py-1 rounded-full font-label-md text-xs font-bold border ${statusInfo.color}`}>
                        {statusInfo.text}
                      </span>
                    </div>
                    <p className="font-display-lg text-3xl font-extrabold text-on-surface capitalize">
                      {subscription?.plan || 'None'}
                    </p>
                    {subscription?.renewsAt && isActive && (
                      <p className="font-body-md text-sm text-on-surface-variant mt-1">
                        Renews on: <span className="text-primary font-semibold">{new Date(subscription.renewsAt).toLocaleDateString()}</span>
                      </p>
                    )}
                    {subscription?.subscriptionEndsAt && isCanceled && (
                      <p className="font-body-md text-sm text-on-surface-variant mt-1">
                        Access expires: <span className="text-amber-400 font-semibold">{new Date(subscription.subscriptionEndsAt).toLocaleDateString()}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    {isActive && (
                      <>
                        <button
                          onClick={() => setShowPauseModal(true)}
                          disabled={actionLoading === 'pause'}
                          className="px-4 py-2 bg-surface-container-high border border-outline-variant rounded-xl text-on-surface font-label-md text-sm hover:bg-surface-container-highest transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-base">pause</span>
                          Pause Plan
                        </button>
                        <button
                          onClick={() => setShowCancelModal(true)}
                          disabled={actionLoading === 'cancel'}
                          className="px-4 py-2 bg-error-container/20 border border-error/30 rounded-xl text-error font-label-md text-sm hover:bg-error-container/40 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-base">cancel</span>
                          Cancel Plan
                        </button>
                      </>
                    )}
                    {isPaused && (
                      <button
                        onClick={handleResume}
                        disabled={actionLoading === 'resume'}
                        className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-xl font-label-md text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {actionLoading === 'resume' ? (
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                        ) : (
                          <span className="material-symbols-outlined text-base">play_arrow</span>
                        )}
                        Resume Plan
                      </button>
                    )}
                    {isCanceled && (
                      <button
                        onClick={handleResume}
                        disabled={actionLoading === 'resume'}
                        className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-xl font-label-md text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {actionLoading === 'resume' ? (
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                        ) : (
                          <span className="material-symbols-outlined text-base">play_arrow</span>
                        )}
                        Reactivate Subscription
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Change Plan Section */}
              <section>
                <h2 className="font-headline-md text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">swap_horiz</span>
                  Change Plan
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {PLANS.map((plan) => {
                    const isCurrent = subscription?.plan === plan.id;
                    const priceDisplay = subscription?.billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
                    return (
                      <div
                        key={plan.id}
                        className={`relative bg-surface-container-low border rounded-2xl p-5 transition-all ${
                          isCurrent
                            ? 'border-primary/50 ring-1 ring-primary/20'
                            : 'border-outline-variant hover:border-outline'
                        }`}
                      >
                        {isCurrent && (
                          <div className="absolute -top-2.5 left-4 px-3 py-0.5 bg-primary text-on-primary font-label-md text-[10px] font-bold rounded-full">
                            Current Plan
                          </div>
                        )}

                        <h3 className="font-headline-md text-lg font-bold text-on-surface mb-1">{plan.name}</h3>
                        <p className="font-display-lg text-2xl font-extrabold text-on-surface mb-3">{priceDisplay}</p>

                        <div className="space-y-1.5 mb-4">
                          {plan.agents.map((agent, idx) => (
                            <div key={idx} className="flex items-center gap-2 font-body-md text-xs text-on-surface-variant">
                              <span className="material-symbols-outlined text-xs text-emerald-400">check_circle</span>
                              {agent}
                            </div>
                          ))}
                        </div>

                        {isCurrent ? (
                          <div className="w-full py-2.5 bg-surface-container border border-outline-variant rounded-xl text-center font-label-md text-xs text-on-surface-variant">
                            Current Plan
                          </div>
                        ) : (
                          <button
                            onClick={() => handleChangePlan(plan.id)}
                            disabled={!!actionLoading}
                            className="w-full py-2.5 bg-surface-container-high border border-outline-variant rounded-xl text-on-surface font-label-md text-xs font-semibold hover:bg-surface-container-highest transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            {actionLoading === plan.id ? (
                              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                            ) : (
                              <>
                                Switch to {plan.name}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Billing Details */}
              <section className="bg-surface-container-low border border-outline-variant rounded-2xl p-6">
                <h2 className="font-headline-md text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">receipt_long</span>
                  SafePay Details
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-body-md text-sm">
                  <div>
                    <span className="text-on-surface-variant text-xs">Account Email</span>
                    <p className="text-on-surface font-semibold">{user?.email || '—'}</p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant text-xs">Payment Provider</span>
                    <p className="text-on-surface font-semibold flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-emerald-400">verified</span>
                      SafePay Sandbox / Live
                    </p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant text-xs">Billing Cycle</span>
                    <p className="text-on-surface font-semibold capitalize">{subscription?.billingCycle || 'monthly'}</p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant text-xs">SafePay Subscription ID</span>
                    <p className="text-on-surface font-mono font-semibold text-xs break-all">
                      {subscription?.subscriptionId || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant text-xs">Status</span>
                    <p className="text-on-surface font-semibold capitalize">{subscription?.status?.replace('_', ' ') || '—'}</p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant text-xs">Last Updated</span>
                    <p className="text-on-surface font-semibold">
                      {subscription?.updatedAt ? new Date(subscription.updatedAt).toLocaleDateString() : '—'}
                    </p>
                  </div>
                </div>
              </section>

              <div className="text-center pt-4">
                <Link href="/dashboard" className="text-primary font-label-md text-sm hover:underline flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Back to Dashboard
                </Link>
              </div>
            </div>
          )}

          {/* Pause Confirmation Modal */}
          {showPauseModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
              <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-2xl max-w-md w-full">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 mx-auto">
                    <span className="material-symbols-outlined text-amber-400 text-3xl">pause_circle</span>
                  </div>
                  <h3 className="font-headline-md text-xl font-bold text-on-surface">Pause Subscription?</h3>
                  <p className="font-body-md text-sm text-on-surface-variant">
                    Pausing will temporarily stop automatic recurring charges on your SafePay subscription. You can resume anytime.
                  </p>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowPauseModal(false)}
                      className="flex-1 py-3 bg-surface-container-high border border-outline-variant rounded-xl text-on-surface font-label-md text-sm font-semibold hover:bg-surface-container-highest transition-colors"
                    >
                      Keep Active
                    </button>
                    <button
                      onClick={handlePause}
                      disabled={actionLoading === 'pause'}
                      className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-label-md text-sm font-bold hover:bg-amber-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'pause' ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        'Yes, Pause'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cancel Confirmation Modal */}
          {showCancelModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
              <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-2xl max-w-md w-full">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-error-container/20 border border-error/30 mx-auto">
                    <span className="material-symbols-outlined text-error text-3xl">warning</span>
                  </div>
                  <h3 className="font-headline-md text-xl font-bold text-on-surface">Cancel Subscription?</h3>
                  <p className="font-body-md text-sm text-on-surface-variant">
                    Your SafePay subscription will be canceled. Your agent access will continue until the end of the current billing period.
                  </p>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowCancelModal(false)}
                      className="flex-1 py-3 bg-surface-container-high border border-outline-variant rounded-xl text-on-surface font-label-md text-sm font-semibold hover:bg-surface-container-highest transition-colors"
                    >
                      Keep Plan
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={actionLoading === 'cancel'}
                      className="flex-1 py-3 bg-error text-white rounded-xl font-label-md text-sm font-bold hover:bg-error/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'cancel' ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        'Yes, Cancel'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
