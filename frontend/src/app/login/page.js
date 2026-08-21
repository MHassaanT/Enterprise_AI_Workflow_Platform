'use client';
import { useState } from 'react';
import Link from 'next/link';
import { login } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const loginData = await login(email.trim(), password);
      if (loginData.token) {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-primary/15 blur-[130px] rounded-full pointer-events-none"></div>

      <div className="max-w-md w-full mx-auto relative z-10">
        {/* Logo Branding */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group mb-4">
            <div className="h-12 w-12 rounded-xl bg-primary-container/20 border border-primary/40 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-md">
              <span className="material-symbols-outlined text-3xl">hexagon</span>
            </div>
            <span className="font-display-lg text-2xl font-extrabold text-on-surface tracking-tight">Enterprise AI</span>
          </Link>
          <h1 className="font-display-lg text-3xl font-extrabold text-on-surface">Sign In to Your Workspace</h1>
          <p className="font-body-md text-on-surface-variant mt-2">
            Access your multi-agent dashboard, approvals queue, and workflow orchestrations.
          </p>
        </div>

        {/* Login Form Container */}
        <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-error-container/20 border border-error/40 text-error font-label-md text-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-xl shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-label-md text-xs font-semibold text-on-surface mb-2">Work Email Address</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">mail</span>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary transition-colors text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block font-label-md text-xs font-semibold text-on-surface">Password</label>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">lock</span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary transition-colors text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-bold rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 text-base disabled:opacity-50 mt-2"
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></span>
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <span className="material-symbols-outlined text-xl">login</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-outline-variant/60 text-center">
            <p className="font-body-md text-xs text-on-surface-variant">
              Don't have an enterprise workspace yet?{' '}
              <Link href="/signup" className="text-primary font-bold hover:underline">
                Create New Company Account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
