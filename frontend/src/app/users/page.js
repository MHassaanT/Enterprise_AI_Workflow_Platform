'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '../components/AuthGuard';
import { fetchUsers, provisionReviewer, getUser } from '@/lib/api';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setCurrentUser(getUser());
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to load tenant users.' });
    } finally {
      setLoading(false);
    }
  };

  const handleProvision = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    try {
      setProvisioning(true);
      setMessage({ type: '', text: '' });
      await provisionReviewer(email, password);
      setMessage({ type: 'success', text: `Reviewer account for ${email} created successfully!` });
      setEmail('');
      setPassword('');
      await loadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to provision reviewer.' });
    } finally {
      setProvisioning(false);
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <main className="max-w-container-max mx-auto px-lg py-xl">
          <header className="mb-xl border-b border-outline-variant pb-lg flex flex-col md:flex-row md:items-center justify-between gap-md">
            <div>
              <h1 className="font-display-lg text-display-lg text-on-surface mb-2">Team & Role-Based Access Control</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                Manage your tenant team, provision reviewer accounts, and enforce system RBAC boundaries.
              </p>
            </div>
            <span className="font-label-md text-label-md text-primary bg-primary-container/10 px-3 py-1 rounded-full border border-primary/20 whitespace-nowrap self-start md:self-center">
              🏢 Tenant Admin Control
            </span>
          </header>

          {!isAdmin && (
            <div className="p-lg rounded-xl bg-error-container/20 text-error border border-error/30 font-body-md">
              ⚠️ <b>Access Restricted:</b> Only Tenant Admin accounts have access to provision user credentials.
            </div>
          )}

          {isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
              {/* Provision Form */}
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-md">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">➕</span>
                  <h3 className="font-headline-md text-headline-md text-on-surface font-bold">Provision Reviewer Account</h3>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Generate discrete login credentials for team members with restricted reviewer permissions (Human Approval Queue & Chat Inspection only).
                </p>

                {message.text && (
                  <div className={`p-md rounded-lg font-body-md ${message.type === 'error' ? 'bg-error-container/20 text-error border border-error/30' : 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/40'}`}>
                    {message.text}
                  </div>
                )}

                <form onSubmit={handleProvision} className="space-y-md">
                  <div className="flex flex-col gap-2">
                    <label className="font-label-md text-label-md text-on-surface-variant">Reviewer Email</label>
                    <input
                      type="email"
                      required
                      placeholder="reviewer@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="font-label-md text-label-md text-on-surface-variant">Initial Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={provisioning || !email || !password}
                    className="w-full py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50 shadow-sm mt-2"
                  >
                    {provisioning ? 'Provisioning Account...' : 'Provision Reviewer Account ➔'}
                  </button>
                </form>
              </div>

              {/* User Roster */}
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-md">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">👥</span>
                  <h3 className="font-headline-md text-headline-md text-on-surface font-bold">Tenant User Roster ({users.length})</h3>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  All active accounts associated with your tenant organisation.
                </p>

                {loading ? (
                  <div className="p-xl text-center text-on-surface-variant font-body-md">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="p-xl text-center text-on-surface-variant font-body-md">No users found.</div>
                ) : (
                  <div className="space-y-3">
                    {users.map((u) => (
                      <div className="bg-surface border border-outline-variant rounded-lg p-md flex items-center justify-between" key={u.id}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{u.role === 'admin' ? '👑' : '🔍'}</span>
                          <div>
                            <div className="font-body-md text-on-surface font-semibold">{u.email}</div>
                            <div className="font-label-md text-label-md text-on-surface-variant">
                              Created: {new Date(u.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <span className={`font-label-md text-label-md px-3 py-1 rounded-full border font-mono uppercase ${u.role === 'admin' ? 'text-primary bg-primary-container/10 border-primary/20' : 'text-tertiary bg-tertiary-container/10 border-tertiary/20'}`}>
                          {u.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
