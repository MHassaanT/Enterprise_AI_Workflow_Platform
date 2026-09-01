'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';

function PaymentSuccessContent() {
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    let timerId;
    let attempts = 0;
    const maxAttempts = 10;

    const checkStatus = async () => {
      try {
        const token = localStorage.getItem('ai_platform_token');
        const res = await fetch('/api/subscription/status', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        
        if (!res.ok) throw new Error('Failed to fetch subscription status');
        
        const data = await res.json();
        
        if (data.status === 'active') {
          setStatus('success');
        } else if (data.status === 'trialing' || data.status === 'pending_verification') {
          attempts += 1;
          if (attempts < maxAttempts) {
            timerId = setTimeout(checkStatus, 3000);
          } else {
            setStatus('pending');
          }
        } else {
          setStatus('pending');
        }
      } catch (err) {
        console.error('Status check error:', err);
        setStatus('error');
      }
    };
    
    checkStatus();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto p-8 bg-surface-container-low border border-outline-variant rounded-2xl shadow-2xl space-y-6">
        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-on-surface">Verifying Payment...</h1>
            <p className="text-on-surface-variant text-sm mt-2">Please wait while we confirm your subscription with SafePay.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <span className="material-symbols-outlined text-6xl text-emerald-400 mb-2">check_circle</span>
            <h1 className="text-2xl font-bold text-on-surface">Payment Successful! 🎉</h1>
            <p className="text-on-surface-variant text-sm mt-2">Your subscription is now active. Let&apos;s set up your AI agents.</p>
            <div className="flex flex-col gap-3 mt-6">
              <Link href="/onboard" className="w-full py-3.5 px-6 bg-primary text-on-primary font-bold text-sm rounded-xl shadow-lg hover:bg-primary-container transition-all flex items-center justify-center gap-2">
                <span>Start Agent Onboarding Setup</span>
                <span className="material-symbols-outlined text-lg">rocket_launch</span>
              </Link>
              <Link href="/dashboard" className="w-full py-2.5 px-4 bg-surface-container border border-outline-variant text-on-surface-variant font-semibold text-xs rounded-xl hover:bg-surface-container-high transition-colors">
                Skip to Workspace Dashboard
              </Link>
            </div>
          </>
        )}
        {status === 'pending' && (
          <>
            <span className="material-symbols-outlined text-6xl text-amber-400 mb-2">schedule</span>
            <h1 className="text-2xl font-bold text-on-surface">Payment Processing</h1>
            <p className="text-on-surface-variant text-sm mt-2">Your payment is being processed by SafePay. We&apos;ll update your account shortly.</p>
            <div className="flex flex-col gap-3 mt-6">
              <Link href="/onboard" className="w-full py-3.5 px-6 bg-primary text-on-primary font-bold text-sm rounded-xl shadow-lg hover:bg-primary-container transition-all flex items-center justify-center gap-2">
                <span>Proceed to Agent Onboarding</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </Link>
              <Link href="/dashboard" className="w-full py-2.5 px-4 bg-surface-container border border-outline-variant text-on-surface-variant font-semibold text-xs rounded-xl hover:bg-surface-container-high transition-colors">
                Go to Dashboard
              </Link>
            </div>
          </>
        )}
        {status === 'error' && (
          <>
            <span className="material-symbols-outlined text-6xl text-error mb-2">error</span>
            <h1 className="text-2xl font-bold text-on-surface">Something Went Wrong</h1>
            <p className="text-on-surface-variant text-sm mt-2">We couldn&apos;t verify your payment status. Please contact support.</p>
            <Link href="/subscribe" className="mt-6 inline-block px-6 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-lg hover:bg-primary-container transition-all">
              Try Again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
