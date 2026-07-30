'use client';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
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
      <div className="page-wrapper">
        <Header />

        <main className="main-content">
          <div className="page-header">
            <div>
              <h1 className="page-title">Team & Role-Based Access Control</h1>
              <p className="page-subtitle">
                Manage your tenant team, provision reviewer accounts, and enforce system RBAC boundaries.
              </p>
            </div>
            <span className="tenant-badge">🏢 Tenant Admin Control</span>
          </div>

          {!isAdmin && (
            <div className="access-denied-box">
              ⚠️ <b>Access Restricted:</b> Only Tenant Admin accounts have access to provision user credentials.
            </div>
          )}

          {isAdmin && (
            <div className="content-grid">
              {/* Provision Form */}
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">➕</span>
                  <h3>Provision Reviewer Account</h3>
                </div>
                <p className="card-desc">
                  Generate discrete login credentials for team members with restricted reviewer permissions (Human Approval Queue & Chat Inspection only).
                </p>

                {message.text && (
                  <div className={`alert-banner alert-${message.type}`}>
                    {message.text}
                  </div>
                )}

                <form onSubmit={handleProvision} className="provision-form">
                  <div className="form-group">
                    <label>Reviewer Email</label>
                    <input
                      type="email"
                      required
                      placeholder="reviewer@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>Initial Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={provisioning || !email || !password}
                    className="submit-btn"
                  >
                    {provisioning ? 'Provisioning Account...' : 'Provision Reviewer Account ➔'}
                  </button>
                </form>
              </div>

              {/* User Roster */}
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">👥</span>
                  <h3>Tenant User Roster ({users.length})</h3>
                </div>
                <p className="card-desc">
                  All active accounts associated with your tenant organisation.
                </p>

                {loading ? (
                  <div className="loading-box">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="empty-box">No users found.</div>
                ) : (
                  <div className="user-list">
                    {users.map((u) => (
                      <div className="user-item" key={u.id}>
                        <div className="user-avatar">
                          {u.role === 'admin' ? '👑' : '🔍'}
                        </div>
                        <div className="user-details">
                          <div className="user-email-text">{u.email}</div>
                          <div className="user-date">
                            Created: {new Date(u.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <span className={`role-pill role-${u.role}`}>
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

        <style jsx>{`
          .page-wrapper {
            min-height: 100vh;
            background: #f8fafc;
          }
          .main-content {
            max-width: 1200px;
            margin: 2rem auto;
            padding: 0 1.5rem;
          }
          .page-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 2rem;
          }
          .page-title {
            font-size: 1.75rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
          }
          .page-subtitle {
            color: #64748b;
            margin: 0.25rem 0 0 0;
            font-size: 0.95rem;
          }
          .tenant-badge {
            background: #eff6ff;
            color: #1d4ed8;
            border: 1px solid #bfdbfe;
            padding: 0.4rem 0.85rem;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.85rem;
          }
          .access-denied-box {
            background: #fef2f2;
            color: #991b1b;
            border: 1px solid #fecaca;
            padding: 1.25rem;
            border-radius: 12px;
            font-size: 0.95rem;
          }
          .content-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.5rem;
          }
          @media (max-width: 868px) {
            .content-grid {
              grid-template-columns: 1fr;
            }
          }
          .card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 1.75rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          }
          .card-header {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            margin-bottom: 0.5rem;
          }
          .card-icon {
            font-size: 1.3rem;
          }
          .card-header h3 {
            margin: 0;
            font-size: 1.15rem;
            font-weight: 700;
            color: #0f172a;
          }
          .card-desc {
            color: #64748b;
            font-size: 0.875rem;
            margin: 0 0 1.25rem 0;
            line-height: 1.5;
          }
          .alert-banner {
            padding: 0.75rem 1rem;
            border-radius: 8px;
            font-size: 0.875rem;
            margin-bottom: 1.25rem;
          }
          .alert-success {
            background: #f0fdf4;
            color: #166534;
            border: 1px solid #bbf7d0;
          }
          .alert-error {
            background: #fef2f2;
            color: #991b1b;
            border: 1px solid #fecaca;
          }
          .provision-form {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
          }
          .form-group label {
            font-weight: 600;
            font-size: 0.85rem;
            color: #334155;
          }
          .form-input {
            padding: 0.65rem 0.85rem;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-size: 0.9rem;
            outline: none;
            transition: border-color 0.2s;
          }
          .form-input:focus {
            border-color: #2563eb;
          }
          .submit-btn {
            background: #2563eb;
            color: #ffffff;
            border: none;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.9rem;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 0.5rem;
          }
          .submit-btn:hover {
            background: #1d4ed8;
          }
          .submit-btn:disabled {
            background: #94a3b8;
            cursor: not-allowed;
          }
          .user-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }
          .user-item {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            padding: 0.85rem 1rem;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
          }
          .user-avatar {
            font-size: 1.4rem;
          }
          .user-details {
            flex: 1;
          }
          .user-email-text {
            font-weight: 600;
            font-size: 0.9rem;
            color: #0f172a;
          }
          .user-date {
            font-size: 0.775rem;
            color: #64748b;
          }
          .role-pill {
            text-transform: uppercase;
            font-size: 0.725rem;
            font-weight: 700;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
          }
          .role-admin {
            background: #e0e7ff;
            color: #4338ca;
          }
          .role-reviewer {
            background: #fef3c7;
            color: #b45309;
          }
          .loading-box, .empty-box {
            text-align: center;
            color: #64748b;
            padding: 2rem;
            font-size: 0.9rem;
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
