'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { register, crawlCompanyWebsite } from '@/lib/api';

export default function SignupPage() {
  // Navigation hook
  const [router, setRouter] = useState(null);

  // Form State
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [crawlNotice, setCrawlNotice] = useState(null);

  // Section 1: Company Details
  const [companyName, setCompanyName] = useState('');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [companyRole, setCompanyRole] = useState('');

  // Section 2: User Details
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Form Submit State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleCrawlWebsite = async (e) => {
    e?.preventDefault();
    if (!websiteUrl.trim()) {
      setCrawlNotice({ type: 'warning', text: 'Please enter a website URL to crawl.' });
      return;
    }

    setCrawling(true);
    setCrawlNotice(null);

    try {
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
      await register({
        companyName: companyName.trim(),
        description: description.trim(),
        website: websiteUrl.trim(),
        industry: industry.trim(),
        fullName: fullName.trim(),
        companyRole: companyRole.trim() || 'Administrator',
        email: email.trim(),
        password
      });

      // Auto login after registration
      const { login } = await import('@/lib/api');
      await login(email.trim(), password);

      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your information and try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/10 blur-[130px] rounded-full pointer-events-none"></div>

      <div className="max-w-3xl w-full mx-auto relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group mb-4">
            <div className="h-12 w-12 rounded-xl bg-primary-container/20 border border-primary/40 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-md">
              <span className="material-symbols-outlined text-3xl">hexagon</span>
            </div>
            <span className="font-display-lg text-2xl font-extrabold text-on-surface tracking-tight">Enterprise AI</span>
          </Link>
          <h1 className="font-display-lg text-3xl font-extrabold text-on-surface">Create Your Workspace Account</h1>
          <p className="font-body-md text-on-surface-variant mt-2">
            Set up your organization and deploy custom AI agents in under 2 minutes.
          </p>
        </div>

        {/* ── CRAWL4AI AUTO-FILL SECTION ── */}
        <div className="bg-surface-container-low border border-primary/30 rounded-2xl p-6 mb-8 shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-8 h-8 rounded-lg bg-primary-container/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-sm">
              ⚡
            </span>
            <div>
              <h3 className="font-headline-md text-lg font-bold text-on-surface">Auto-fill Company Details</h3>
              <p className="font-body-md text-xs text-on-surface-variant">Enter your company website to let Crawl4AI extract your details automatically.</p>
            </div>
          </div>

          <form onSubmit={handleCrawlWebsite} className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">language</span>
              <input
                type="text"
                placeholder="https://yourcompany.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary transition-colors text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={crawling}
              className="px-6 py-3 bg-primary/90 hover:bg-primary text-on-primary font-label-md text-label-md font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            >
              {crawling ? (
                <>
                  <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></span>
                  <span>Crawling Website...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">auto_awesome</span>
                  <span>Auto-fill with Crawl4AI</span>
                </>
              )}
            </button>
          </form>

          {crawlNotice && (
            <div className={`mt-4 p-3 rounded-xl border font-label-md text-xs flex items-center gap-2 ${
              crawlNotice.type === 'success' 
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' 
                : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
            }`}>
              <span className="material-symbols-outlined text-base">
                {crawlNotice.type === 'success' ? 'check_circle' : 'info'}
              </span>
              <span>{crawlNotice.text}</span>
            </div>
          )}
        </div>

        {/* ── MAIN REGISTRATION FORM ── */}
        <form onSubmit={handleSubmit} className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 sm:p-8 shadow-2xl space-y-8">
          {error && (
            <div className="p-4 rounded-xl bg-error-container/20 border border-error/40 text-error font-label-md text-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-xl shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── SECTION 1: COMPANY DETAILS ── */}
          <div className="space-y-5 border-b border-outline-variant/60 pb-8">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-primary text-on-primary font-bold text-xs flex items-center justify-center">1</span>
              <h2 className="font-headline-md text-xl font-bold text-on-surface">Company Details</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Acme Corporation"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Industry Sector</label>
                <input
                  type="text"
                  placeholder="SaaS / Enterprise Software"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Company Description</label>
              <textarea
                rows={3}
                placeholder="Brief summary of company offerings, target market, and value proposition..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors text-sm resize-none"
              />
            </div>

            <div>
              <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Your Role at the Company</label>
              <input
                type="text"
                placeholder="e.g. Chief Executive Officer, Sales VP, HR Manager"
                value={companyRole}
                onChange={(e) => setCompanyRole(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
              />
            </div>
          </div>

          {/* ── SECTION 2: USER DETAILS ── */}
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-primary text-on-primary font-bold text-xs flex items-center justify-center">2</span>
              <h2 className="font-headline-md text-xl font-bold text-on-surface">User Details & Credentials</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Sarah Jenkins"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Work Email *</label>
                <input
                  type="email"
                  required
                  placeholder="sarah@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Confirm Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary bg-surface"
                />
                <span className="font-body-md text-xs text-on-surface-variant">
                  I agree to the <a href="#" className="text-primary hover:underline font-semibold">Terms of Service</a> and <a href="#" className="text-primary hover:underline font-semibold">Privacy Policy</a>.
                </span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-bold rounded-xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 text-base disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="w-5 h-5 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></span>
                <span>Creating Workspace...</span>
              </>
            ) : (
              <>
                <span>Complete Sign Up & Launch Platform</span>
                <span className="material-symbols-outlined text-xl">arrow_forward</span>
              </>
            )}
          </button>

          <p className="text-center font-body-md text-xs text-on-surface-variant">
            Already have an account? <Link href="/login" className="text-primary font-bold hover:underline">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
