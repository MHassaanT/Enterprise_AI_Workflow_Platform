'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  createOpenRole, fetchOpenRoles, fetchOpenRole, updateOpenRole,
  deleteOpenRole, rankApplications, scanTalentPool
} from '@/lib/api';

export default function EmailIntakeTab() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRoleId, setActiveRoleId] = useState(null);
  const [activeRole, setActiveRole] = useState(null);
  const [applications, setApplications] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [ranking, setRanking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', requirements: '', accepting_until: '', search_query: 'subject:job application' });

  const loadRoles = useCallback(async () => {
    try { setLoading(true); setRoles(await fetchOpenRoles()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const loadRoleDetails = async (id) => {
    try {
      setActiveRoleId(id);
      const data = await fetchOpenRole(id);
      setActiveRole(data.openRole);
      setApplications(data.applications || []);
    } catch (e) { alert(e.message); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const role = await createOpenRole(form.title, form.description, form.requirements, form.accepting_until, form.search_query);
      setForm({ title: '', description: '', requirements: '', accepting_until: '', search_query: 'subject:job application' });
      setShowCreateForm(false);
      await loadRoles();
      loadRoleDetails(role.id);
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this role and all its applications?')) return;
    try {
      await deleteOpenRole(id);
      if (activeRoleId === id) { setActiveRoleId(null); setActiveRole(null); setApplications([]); }
      loadRoles();
    } catch (e) { alert(e.message); }
  };

  const handleCloseRole = async (id) => {
    try {
      await updateOpenRole(id, { status: 'closed' });
      loadRoles();
      if (activeRoleId === id) loadRoleDetails(id);
    } catch (e) { alert(e.message); }
  };

  const handleRank = async () => {
    try { setRanking(true); setApplications(await rankApplications(activeRoleId)); }
    catch (e) { alert(e.message); }
    finally { setRanking(false); }
  };

  const handleScanPool = async () => {
    try { setScanning(true); const result = await scanTalentPool(activeRoleId); alert(`Transferred ${result.transferred} prospect(s) from talent pool.`); loadRoleDetails(activeRoleId); }
    catch (e) { alert(e.message); }
    finally { setScanning(false); }
  };

  const statusColor = (status) => {
    const map = { open: '#22c55e', closed: '#ef4444', filled: '#3b82f6' };
    return map[status] || '#6b7280';
  };

  const appStatusBadge = (status) => {
    const colors = { received: '#f59e0b', processing: '#3b82f6', ready: '#22c55e', shortlisted: '#8b5cf6', rejected: '#ef4444', interview_scheduled: '#06b6d4', failed: '#ef4444' };
    return (
      <span style={{ background: `${colors[status] || '#6b7280'}18`, color: colors[status] || '#6b7280', padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
        {status?.replace('_', ' ')}
      </span>
    );
  };

  const renderScoreBar = (score) => {
    if (score == null) return <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>Not scored</span>;
    const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36 }}>{score}/100</span>
      </div>
    );
  };

  const daysRemaining = (dateStr) => {
    if (!dateStr) return null;
    const days = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Sidebar — Roles List */}
      <div style={{ width: 320, borderRight: '1px solid var(--color-border)', background: '#fafbfc', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)' }}>
          <button onClick={() => { setShowCreateForm(true); setActiveRoleId(null); }}
            style={{ width: '100%', padding: '10px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            + Open New Role
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 24, fontSize: 13 }}>Loading roles...</p>
          ) : roles.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 24, fontSize: 13 }}>No open roles yet. Create one to start receiving applications via email.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {roles.map(role => {
                const days = daysRemaining(role.accepting_until);
                return (
                  <div key={role.id} onClick={() => { loadRoleDetails(role.id); setShowCreateForm(false); }}
                    style={{
                      padding: 14, borderRadius: 10, border: `1px solid ${activeRoleId === role.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: activeRoleId === role.id ? 'rgba(37, 99, 235, 0.04)' : '#fff',
                      cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{role.title}</h4>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(role.status), flexShrink: 0, marginTop: 4 }} title={role.status} />
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--color-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>group</span>
                        {role.application_count || 0} apps
                      </span>
                      {role.status === 'open' && days != null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: days <= 3 ? '#ef4444' : days <= 7 ? '#f59e0b' : 'var(--color-muted)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
                          {days > 0 ? `${days}d left` : 'Expired'}
                        </span>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(role.id); }}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: 2, opacity: 0 }}
                      onMouseEnter={e => e.target.style.opacity = 1}
                      onMouseLeave={e => e.target.style.opacity = 0}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 32, background: 'var(--color-bg)' }}>
        {showCreateForm ? (
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: 'var(--color-text)' }}>Open New Role for Email Applications</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>Role Title</label>
                <input type="text" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, background: '#fff', color: 'var(--color-text)' }}
                  placeholder="e.g. Senior Python Developer" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>Description</label>
                <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={5}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, background: '#fff', color: 'var(--color-text)', resize: 'vertical' }}
                  placeholder="Paste the job description..." />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>Requirements (Optional)</label>
                <textarea value={form.requirements} onChange={e => setForm({ ...form, requirements: e.target.value })} rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, background: '#fff', color: 'var(--color-text)', resize: 'vertical' }}
                  placeholder="Key qualifications and skills..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>Accepting Until</label>
                  <input type="date" required value={form.accepting_until} onChange={e => setForm({ ...form, accepting_until: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, background: '#fff', color: 'var(--color-text)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>Gmail Search Query</label>
                  <input type="text" value={form.search_query} onChange={e => setForm({ ...form, search_query: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, background: '#fff', color: 'var(--color-text)' }}
                    placeholder="subject:job application" />
                </div>
              </div>
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12, fontSize: 12, color: '#0369a1', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, marginTop: 1 }}>info</span>
                <div>The HR Agent will poll your Gmail every 60 seconds using the search query above. Matching emails will be automatically classified and stored. When a new role opens, the talent pool is also scanned for matching prospects.</div>
              </div>
              <button type="submit" style={{ padding: '12px 24px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start' }}>
                Open Role & Start Monitoring
              </button>
            </form>
          </div>
        ) : activeRoleId && activeRole ? (
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            {/* Role Header */}
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>{activeRole.title}</h2>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-muted)', maxWidth: 600 }}>{activeRole.description?.substring(0, 200)}...</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ background: `${statusColor(activeRole.status)}18`, color: statusColor(activeRole.status), padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
                    {activeRole.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--color-muted)' }}>
                <span>Deadline: {new Date(activeRole.accepting_until).toLocaleDateString()}</span>
                <span>Search: <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{activeRole.search_query}</code></span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {activeRole.status === 'open' && (
                  <button onClick={() => handleCloseRole(activeRoleId)} style={{ padding: '8px 16px', background: '#fff', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Close Role
                  </button>
                )}
                <button onClick={handleScanPool} disabled={scanning} style={{ padding: '8px 16px', background: '#f0f9ff', color: '#0284c7', border: '1px solid #7dd3fc', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: scanning ? 0.5 : 1 }}>
                  {scanning ? 'Scanning...' : '🔍 Scan Talent Pool'}
                </button>
              </div>
            </div>

            {/* Applications */}
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--color-text)' }}>
                  Applications ({applications.length})
                </h3>
                <button onClick={handleRank} disabled={ranking || applications.length === 0}
                  style={{ padding: '8px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: ranking || applications.length === 0 ? 0.5 : 1 }}>
                  {ranking ? 'Ranking...' : '⚡ Rank Applications'}
                </button>
              </div>

              {applications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted)', background: '#fafbfc', borderRadius: 8, border: '1px dashed var(--color-border)' }}>
                  <p style={{ fontSize: 14, marginBottom: 8 }}>No applications received yet.</p>
                  <p style={{ fontSize: 12 }}>The HR Agent is monitoring your Gmail. Applications matching the search query will appear here automatically.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Applicant</th>
                        <th style={{ padding: '10px 12px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Score</th>
                        <th style={{ padding: '10px 12px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Source</th>
                        <th style={{ padding: '10px 12px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                        <th style={{ padding: '10px 12px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ack</th>
                        <th style={{ padding: '10px 12px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map(app => (
                        <tr key={app.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{app.applicant_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{app.applicant_email}</div>
                            {app.rank_reasoning && <div style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic', marginTop: 4, maxWidth: 300 }}>{app.rank_reasoning}</div>}
                          </td>
                          <td style={{ padding: '12px', width: 140 }}>{renderScoreBar(app.rank_score)}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: app.source === 'talent_pool_transfer' ? '#f0f9ff' : '#f5f3ff', color: app.source === 'talent_pool_transfer' ? '#0284c7' : '#7c3aed' }}>
                              {app.source === 'talent_pool_transfer' ? 'Pool Transfer' : 'Email'}
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>{appStatusBadge(app.status)}</td>
                          <td style={{ padding: '12px' }}>
                            {app.ack_email_sent ? (
                              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#22c55e' }} title={`Sent ${app.ack_email_sent_at ? new Date(app.ack_email_sent_at).toLocaleString() : ''}`}>check_circle</span>
                            ) : (
                              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-muted)' }}>schedule</span>
                            )}
                          </td>
                          <td style={{ padding: '12px', fontSize: 12, color: 'var(--color-muted)' }}>{new Date(app.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 64, opacity: 0.3, marginBottom: 16 }}>inbox</span>
            <p style={{ fontSize: 16, fontWeight: 500 }}>Email Application Intake</p>
            <p style={{ fontSize: 13, marginTop: 4, maxWidth: 400, textAlign: 'center', lineHeight: 1.5 }}>
              Open a role to start receiving applications via email. The HR agent will automatically poll your Gmail, classify incoming applications, and respond to applicants.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
