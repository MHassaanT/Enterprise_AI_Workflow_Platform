'use client';
import { useState } from 'react';
import { login, register } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!companyName.trim()) throw new Error('Company name is required.');
        await register(companyName, email, password);
        setSuccessMsg('Account registered successfully! Logging you in...');
        // Auto-login after registration
        const loginData = await login(email, password);
        if (loginData.token) {
          router.replace('/');
        }
      } else {
        const loginData = await login(email, password);
        if (loginData.token) {
          router.replace('/');
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex items-center justify-center p-md">
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl max-w-md w-full shadow-2xl space-y-lg">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-surface-container border border-outline-variant rounded-lg text-primary text-2xl mb-2">
            ⚡
          </div>
          <h1 className="font-display-lg text-headline-lg text-on-surface font-bold">Enterprise AI Workforce</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Sign in to your control panel or create a new workspace.</p>
        </div>

        <div className="flex bg-surface-container p-1 rounded-lg border border-outline-variant">
          <button
            type="button"
            className={`flex-1 py-2 font-label-md text-label-md rounded-md transition-colors ${!isRegister ? 'bg-surface text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => { setIsRegister(false); setError(null); setSuccessMsg(null); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`flex-1 py-2 font-label-md text-label-md rounded-md transition-colors ${isRegister ? 'bg-surface text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => { setIsRegister(true); setError(null); setSuccessMsg(null); }}
          >
            Register Company
          </button>
        </div>

        {error && <div className="p-md rounded-lg bg-error-container/20 text-error border border-error/30 font-body-md">⚠️ {error}</div>}
        {successMsg && <div className="p-md rounded-lg bg-emerald-950/20 text-emerald-400 border border-emerald-800/40 font-body-md">✅ {successMsg}</div>}

        <form onSubmit={handleSubmit} className="space-y-md">
          {isRegister && (
            <div className="flex flex-col gap-2">
              <label className="font-label-md text-label-md text-on-surface-variant">Company / Workspace Name</label>
              <input
                type="text"
                placeholder="e.g. Acme Support Services"
                className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface-variant">Email Address</label>
            <input
              type="email"
              placeholder="name@company.com"
              className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-label-md text-label-md text-on-surface-variant">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50 shadow-sm mt-4"
          >
            {loading ? 'Processing...' : isRegister ? 'Create Workspace & Account' : 'Sign In to Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}
