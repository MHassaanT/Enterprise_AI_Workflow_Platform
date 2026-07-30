'use client';
import { useState } from 'react';
import { login, register } from '@/lib/api';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

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
    <div className={styles.authWrapper}>
      <div className={styles.authCard}>
        <div className={styles.brandHeader}>
          <span className={styles.logoIcon}>⚡</span>
          <h1 className={styles.brandTitle}>Enterprise AI Workforce</h1>
        </div>

        <div className={styles.tabContainer}>
          <button
            type="button"
            className={`${styles.tab} ${!isRegister ? styles.activeTab : ''}`}
            onClick={() => { setIsRegister(false); setError(null); setSuccessMsg(null); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`${styles.tab} ${isRegister ? styles.activeTab : ''}`}
            onClick={() => { setIsRegister(true); setError(null); setSuccessMsg(null); }}
          >
            Register Company
          </button>
        </div>

        {error && <div className={styles.errorAlert}>⚠️ {error}</div>}
        {successMsg && <div className={styles.successAlert}>✅ {successMsg}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          {isRegister && (
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Company / Workspace Name</label>
              <input
                type="text"
                placeholder="e.g. Acme Support Services"
                className={styles.input}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Email Address</label>
            <input
              type="email"
              placeholder="name@company.com"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={styles.submitBtn}
          >
            {loading ? 'Processing...' : isRegister ? 'Create Workspace & Account' : 'Sign In to Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}
