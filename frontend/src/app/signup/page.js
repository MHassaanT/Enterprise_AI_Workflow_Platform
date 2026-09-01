'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { initializePaddle } from '@paddle/paddle-js';
import { register, resendVerificationEmail } from '@/lib/api';

const PRICE_IDS = {
  basic: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_BASIC || 'pri_01kp5ptvbcrxkrp8zcvxnv7250',
  pro: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO || 'pri_01kp5py10knnk7gr62cfk7sbxe',
  enterprise: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_ENTERPRISE || 'pri_01kp5py10knnk7gr62cfk7sbxe',
};

const PLANS = [
  { id: 'basic', name: 'Basic', priceLabel: '$50/mo', desc: 'Core AI Agents for small teams' },
  { id: 'pro', name: 'Pro', priceLabel: '$75/mo', desc: 'Full AI Workforce & Workflow Builder', popular: true },
  { id: 'enterprise', name: 'Enterprise', priceLabel: '$110/mo', desc: 'Custom Agents & Dedicated Support' },
];

export default function SignupPage() {
  const router = useRouter();

  // Page State: 'form' | 'pending' | 'success'
  const [pageState, setPageState] = useState('form');

  // Form State
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [crawlNotice, setCrawlNotice] = useState(null);

  // Section 1: Company Details
  const [companyName, setCompanyName] = useState('');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [companyRole, setCompanyRole] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('pro');

  // Section 2: User Details
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Form Submit State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Email Verification Modal & Account State
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [createdAccountData, setCreatedAccountData] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState(null);

  // Paddle Instance
  const [paddle, setPaddle] = useState(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || '';
    const envVar = process.env.NEXT_PUBLIC_PADDLE_ENV || process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT;
    
    // Auto-detect environment based on client token prefix (test_ -> sandbox, live_ -> production)
    let environment = 'production';
    if (token.startsWith('test_')) {
      environment = 'sandbox';
    } else if (envVar === 'sandbox') {
      environment = 'sandbox';
    }

    console.log(`[Paddle Init] Initializing Paddle in '${environment}' mode with token: '${token ? token.slice(0, 8) + '...' : 'NONE'}'`);

    initializePaddle({
      environment,
      token,
    }).then((instance) => {
      if (instance) {
        setPaddle(instance);
      }
    }).catch((err) => {
      console.warn('Paddle initialization notice:', err);
    });
  }, []);

  const handleCrawlWebsite = async (e) => {
    e?.preventDefault();
    if (!websiteUrl.trim()) {
      setCrawlNotice({ type: 'warning', text: 'Please enter a website URL to crawl.' });
      return;
    }

    setCrawling(true);
    setCrawlNotice(null);

    try {
      const { crawlCompanyWebsite } = await import('@/lib/api');
      const data = await crawlCompanyWebsite(websiteUrl.trim());
      if (data.company_name) setCompanyName(data.company_name);
      if (data.description) setDescription(data.description);
      if (data.industry) setIndustry(data.industry);

      if (data.warning) {
        setCrawlNotice({ type: 'warning', text: data.warning });
      } else {
        setCrawlNotice({ type: 'success', text: '✨ Company details successfully extracted using Crawl4AI!' });
      }
    } catch (err) {
      console.error('Crawl error:', err);
      setCrawlNotice({
        type: 'warning',
        text: 'Could not auto-fill details from website. You can manually enter your company info below.'
      });
    } finally {
      setCrawling(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) {
      setError('Company Name is required.');
      return;
    }
    if (!fullName.trim()) {
      setError('Full Name is required.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Email and Password are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!acceptTerms) {
      setError('You must accept the Terms and Conditions & Privacy Policy to sign up.');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Create account on Backend
      const result = await register({
        companyName: companyName.trim(),
        description: description.trim(),
        website: websiteUrl.trim(),
        industry: industry.trim(),
        fullName: fullName.trim(),
        companyRole: companyRole.trim() || 'Administrator',
        email: email.trim(),
        password
      });

      setCreatedAccountData(result);
      setRegisteredEmail(email.trim());

      // 2. Automatically trigger Firebase Client Email Verification
      try {
        const { auth } = await import('@/lib/firebase');
        const { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } = await import('firebase/auth');
        if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY && auth) {
          let fbUser;
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
            fbUser = userCredential.user;
          } catch (fbErr) {
            if (fbErr?.code === 'auth/email-already-in-use') {
              const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
              fbUser = userCredential.user;
            }
          }
          if (fbUser) {
            await sendEmailVerification(fbUser);
            console.log('✅ Firebase Client Verification Email sent to:', email.trim());
          }
        }
      } catch (fbClientErr) {
        console.warn('Firebase Client email dispatch fallback:', fbClientErr.message);
      }

      // Show Verification Modal
      setShowVerificationModal(true);
      setSubmitting(false);
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your information and try again.');
      setSubmitting(false);
    }
  };

  const handleProceedToPayment = async () => {
    setShowVerificationModal(false);
    setPageState('pending');

    const priceId = PRICE_IDS[selectedPlan] || PRICE_IDS.pro;

    const customData = {
      tenant_id: createdAccountData?.tenant?.id || '',
      user_id: createdAccountData?.user?.id || '',
      plan: selectedPlan,
      email: registeredEmail,
    };

    if (paddle) {
      try {
        paddle.Checkout.open({
          items: [{ priceId: priceId, quantity: 1 }],
          customer: { email: registeredEmail },
          customData,
          settings: {
            successUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/login?payment=success`,
          },
          eventCallback: (event) => {
            if (event.name === 'checkout.closed' && event.data?.status !== 'completed') {
              setPageState('form');
            }
            if (event.name === 'checkout.completed') {
              setPageState('success');
            }
          },
        });
      } catch (err) {
        console.error('Paddle open error:', err);
        router.push(`/subscribe?email=${encodeURIComponent(registeredEmail)}`);
      }
    } else {
      router.push(`/subscribe?email=${encodeURIComponent(registeredEmail)}`);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    setResendMessage(null);

    try {
      let sentViaFirebase = false;
      try {
        const { auth } = await import('@/lib/firebase');
        const { sendEmailVerification } = await import('firebase/auth');
        if (auth?.currentUser) {
          await sendEmailVerification(auth.currentUser);
          sentViaFirebase = true;
        }
      } catch (fbErr) {
        console.warn('Firebase Client resend fallback:', fbErr.message);
      }

      await resendVerificationEmail(registeredEmail);
      setResendMessage({
        type: 'success',
        text: sentViaFirebase
          ? 'Verification email automatically sent to your inbox!'
          : 'Verification email resent! Please check your inbox.'
      });
    } catch (err) {
      setResendMessage({ type: 'error', text: err.message || 'Failed to resend. Please try again.' });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/10 blur-[130px] rounded-full pointer-events-none"></div>

      {/* ── EMAIL VERIFICATION & PAYMENT MODAL ── */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-8 shadow-2xl max-w-md w-full relative">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[300px] h-[150px] bg-primary/15 blur-[80px] rounded-full pointer-events-none"></div>

            <div className="relative z-10 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mx-auto">
                <span className="material-symbols-outlined text-emerald-400 text-4xl">mark_email_read</span>
              </div>

              <div>
                <h2 className="font-display-lg text-2xl font-extrabold text-on-surface mb-2">
                  Verification Email Sent
                </h2>
                <p className="font-body-md text-sm text-on-surface-variant">
                  We've sent a verification email to
                </p>
                <p className="font-body-md text-sm font-semibold text-primary mt-1">
                  {registeredEmail}
                </p>
                <p className="font-body-md text-xs text-on-surface-variant mt-3">
                  Please check your inbox (and spam folder). You can verify your email before or after completing your subscription payment.
                </p>
              </div>

              {/* Resend Button */}
              <button
                onClick={handleResendVerification}
                disabled={resending}
                className="text-primary font-label-md text-xs hover:underline disabled:opacity-50 flex items-center justify-center gap-1 mx-auto"
              >
                {resending ? (
                  <>
                    <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                    Resending...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">refresh</span>
                    Didn't receive it? Resend Verification Email
                  </>
                )}
              </button>

              {resendMessage && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  resendMessage.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-error-container/20 border-error/40 text-error'
                }`}>
                  <span className="material-symbols-outlined text-sm">
                    {resendMessage.type === 'success' ? 'check_circle' : 'error'}
                  </span>
                  {resendMessage.text}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleProceedToPayment}
                  className="w-full py-3 px-6 bg-primary text-on-primary font-label-md text-sm font-bold rounded-xl hover:bg-primary-container transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                >
                  <span>Proceed to Payment</span>
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </button>

                <button
                  onClick={() => setShowVerificationModal(false)}
                  className="w-full py-2.5 px-4 bg-surface-container border border-outline-variant text-on-surface-variant font-label-md text-xs font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT PENDING STATE ── */}
      {pageState === 'pending' && (
        <div className="max-w-md mx-auto w-full text-center space-y-6 my-auto">
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-8 shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary-container/20 border border-primary/30 flex items-center justify-center mx-auto animate-pulse">
              <span className="material-symbols-outlined text-primary text-3xl">payments</span>
            </div>
            <div>
              <h2 className="font-display-lg text-2xl font-bold text-on-surface mb-2">Complete Your Payment</h2>
              <p className="font-body-md text-sm text-on-surface-variant">
                Please complete the checkout in the payment window to activate your subscription plan.
              </p>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="text-xs text-primary hover:underline font-semibold"
            >
              Skip to Sign In ↗
            </button>
          </div>
        </div>
      )}

      {/* ── PAYMENT CONFIRMED / SUCCESS STATE ── */}
      {pageState === 'success' && (
        <div className="max-w-md mx-auto w-full text-center space-y-6 my-auto">
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-8 shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-emerald-400 text-4xl">check_circle</span>
            </div>
            <div>
              <h2 className="font-display-lg text-2xl font-bold text-on-surface mb-2">Payment Confirmed!</h2>
              <p className="font-body-md text-sm text-on-surface-variant">
                Your subscription has been set up. Please verify your email from your inbox before logging in to your account.
              </p>
            </div>
            <Link
              href="/login"
              className="w-full inline-block py-3 px-6 bg-primary text-on-primary font-label-md text-sm font-bold rounded-xl hover:bg-primary-container transition-all shadow-lg shadow-primary/20"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      )}

      {/* ── MAIN SIGNUP FORM ── */}
      {pageState === 'form' && (
        <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10 my-auto">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-3 group mb-4">
              <div className="h-12 w-12 rounded-2xl bg-primary-container/20 flex items-center justify-center border border-primary/30 group-hover:border-primary/60 transition-colors">
                <span className="material-symbols-outlined text-primary text-2xl">hexagon</span>
              </div>
            </Link>
            <h1 className="font-display-lg text-3xl font-extrabold text-on-surface tracking-tight">
              Start your free trial
            </h1>
            <p className="font-body-md text-on-surface-variant text-sm mt-2">
              Create your Enterprise AI account — select your plan and verify your email.
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            {error && (
              <div className="p-4 rounded-xl bg-error-container/20 border border-error/40 text-error font-body-md text-sm flex items-center gap-3">
                <span className="material-symbols-outlined text-lg">error</span>
                <span>{error}</span>
              </div>
            )}

            {/* Plan Selector Cards */}
            <div className="space-y-2">
              <label className="font-label-md text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                Select Subscription Plan
              </label>
              <div className="grid grid-cols-3 gap-3">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      selectedPlan === plan.id
                        ? 'bg-primary-container/10 border-primary text-on-surface font-semibold shadow-md'
                        : 'bg-surface-container border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-2 right-2 px-1.5 py-0.5 bg-primary text-on-primary text-[9px] font-bold rounded uppercase">
                        Popular
                      </span>
                    )}
                    <p className="text-xs font-bold text-on-surface">{plan.name}</p>
                    <p className="text-sm font-extrabold text-primary mt-1">{plan.priceLabel}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Website Crawler Auto-fill Card */}
            <div className="p-4 rounded-xl bg-surface-container border border-outline-variant space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="websiteUrl" className="font-label-md text-xs text-primary font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">travel_explore</span>
                  Auto-fill Company Info via Crawl4AI
                </label>
                <span className="text-[10px] bg-primary-container/20 text-primary px-2 py-0.5 rounded font-mono font-bold">
                  AI Powered
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  id="websiteUrl"
                  type="url"
                  placeholder="https://yourcompany.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="flex-1 bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleCrawlWebsite}
                  disabled={crawling}
                  className="px-4 py-2 bg-primary-container/30 text-primary border border-primary/40 font-label-md text-xs font-bold rounded-lg hover:bg-primary-container/50 transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                >
                  {crawling ? (
                    <>
                      <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                      Extracting...
                    </>
                  ) : (
                    'Auto-fill ✨'
                  )}
                </button>
              </div>
              {crawlNotice && (
                <p className={`text-xs ${crawlNotice.type === 'success' ? 'text-emerald-400 font-medium' : 'text-amber-400'}`}>
                  {crawlNotice.text}
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Company Details */}
              <div className="space-y-4 pt-2">
                <h3 className="font-label-md text-xs text-on-surface-variant uppercase tracking-wider font-semibold border-b border-outline-variant pb-2">
                  1. Company & Organization
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-label-md text-xs text-on-surface-variant font-semibold">Company Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Acme Corp"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-label-md text-xs text-on-surface-variant font-semibold">Industry</label>
                    <input
                      type="text"
                      placeholder="e.g. Technology, Retail"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-label-md text-xs text-on-surface-variant font-semibold">Role in Company</label>
                    <select
                      value={companyRole}
                      onChange={(e) => setCompanyRole(e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                    >
                      <option value="">Select your role</option>
                      <option value="Owner">Owner / CEO</option>
                      <option value="Manager">Manager / Director</option>
                      <option value="Marketing">Marketing / Sales</option>
                      <option value="IT">IT / Developer</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-label-md text-xs text-on-surface-variant font-semibold">Company Description</label>
                    <input
                      type="text"
                      placeholder="Brief overview"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Account Credentials */}
              <div className="space-y-4 pt-2">
                <h3 className="font-label-md text-xs text-on-surface-variant uppercase tracking-wider font-semibold border-b border-outline-variant pb-2">
                  2. Administrator Account
                </h3>
                <div className="space-y-1">
                  <label className="font-label-md text-xs text-on-surface-variant font-semibold">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-label-md text-xs text-on-surface-variant font-semibold">Work Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-label-md text-xs text-on-surface-variant font-semibold">Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-label-md text-xs text-on-surface-variant font-semibold">Confirm Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start gap-3 pt-2">
                <input
                  id="acceptTerms"
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-outline-variant bg-surface text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="acceptTerms" className="font-body-md text-xs text-on-surface-variant leading-relaxed select-none">
                  I agree to the <Link href="/terms" target="_blank" className="text-primary hover:underline font-semibold">Terms of Service</Link> and <Link href="/privacy" target="_blank" className="text-primary hover:underline font-semibold">Privacy Policy</Link>.
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-6 bg-primary text-on-primary font-label-md text-sm font-bold rounded-xl hover:bg-primary-container transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></span>
                    Setting up account...
                  </>
                ) : (
                  'Continue to Payment'
                )}
              </button>
            </form>
          </div>

          <p className="text-center font-body-md text-xs text-on-surface-variant mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline font-semibold">
              Sign In
            </Link>
          </p>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-4 font-body-md text-xs text-on-surface-variant relative z-10 flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-6">
        <span>&copy; {new Date().getFullYear()} Enterprise AI Platform. All rights reserved.</span>
        <div className="flex gap-4">
          <Link href="/terms" target="_blank" className="hover:text-primary transition-colors">Terms of Service</Link>
          <span>•</span>
          <Link href="/privacy" target="_blank" className="hover:text-primary transition-colors">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
