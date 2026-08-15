'use client';
import { useState, useEffect, useCallback } from 'react';
import { fetchTalentPool, deleteTalentPoolEntry, fetchOpenRoles, scanTalentPool } from '@/lib/api';

export default function FutureProspectsTab() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [poolData, rolesData] = await Promise.all([fetchTalentPool(), fetchOpenRoles()]);
      setProspects(poolData);
      setRoles(rolesData.filter(r => r.status === 'open'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('Remove this prospect permanently?')) return;
    try {
      await deleteTalentPoolEntry(id);
      setProspects(prev => prev.filter(p => p.id !== id));
    } catch (e) { alert(e.message); }
  };

  const handleScanForRole = async (roleId) => {
    try {
      const result = await scanTalentPool(roleId);
      alert(`Scanned and transferred ${result.transferred} prospect(s).`);
      load();
    } catch (e) { alert(e.message); }
  };

  const filtered = prospects.filter(p => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return (p.applicant_name || '').toLowerCase().includes(search) ||
           (p.applicant_email || '').toLowerCase().includes(search) ||
           (p.desired_role || '').toLowerCase().includes(search);
  });

  const statusBadge = (status) => {
    const colors = { pooled: ['#f59e0b', '#fef3c7'], transferred: ['#22c55e', '#dcfce7'], notified: ['#3b82f6', '#dbeafe'] };
    const [color, bg] = colors[status] || ['#6b7280', '#f3f4f6'];
    return (
      <span style={{ background: bg, color, padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 32, background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>Future Prospects</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-muted)', maxWidth: 500 }}>
              Applicants who applied for roles that aren't currently open. They'll be automatically matched and notified when matching roles open.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {roles.length > 0 && (
              <select onChange={e => { if (e.target.value) handleScanForRole(e.target.value); e.target.value = ''; }}
                style={{ padding: '8px 14px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, background: '#fff', color: 'var(--color-text)', cursor: 'pointer' }}>
                <option value="">🔍 Scan Pool for Role...</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Search by name, email, or desired role..."
            style={{ width: '100%', maxWidth: 400, padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, background: '#fff', color: 'var(--color-text)' }} />
        </div>

        {/* Stats Bar */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total', count: prospects.length, color: '#6b7280' },
            { label: 'Pooled', count: prospects.filter(p => p.status === 'pooled').length, color: '#f59e0b' },
            { label: 'Transferred', count: prospects.filter(p => p.status === 'transferred').length, color: '#22c55e' },
            { label: 'Notified', count: prospects.filter(p => p.status === 'notified').length, color: '#3b82f6' },
          ].map(stat => (
            <div key={stat.label} style={{ padding: '14px 20px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)', minWidth: 120 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${stat.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.count}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Prospects List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-muted)' }}>Loading prospects...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-muted)', background: '#fff', borderRadius: 12, border: '1px dashed var(--color-border)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3, marginBottom: 12, display: 'block' }}>person_search</span>
            <p style={{ fontSize: 14, marginBottom: 4 }}>No prospects in the talent pool yet.</p>
            <p style={{ fontSize: 12 }}>When applicants email for roles that aren't open, they'll appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(p => (
              <div key={p.id} style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)', transition: 'box-shadow 0.2s' }}>
                <div onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                    {(p.applicant_name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{p.applicant_name}</span>
                      {statusBadge(p.status)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>{p.applicant_email}</div>
                  </div>
                  {p.desired_role && (
                    <div style={{ fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '3px 10px', borderRadius: 6, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {p.desired_role}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{new Date(p.created_at).toLocaleDateString()}</div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_outline</span>
                  </button>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-muted)', transition: 'transform 0.2s', transform: expandedId === p.id ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    expand_more
                  </span>
                </div>
                {expandedId === p.id && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: '16px 20px', background: '#fafbfc', animation: 'slideUp 0.2s ease' }}>
                    {p.email_subject && (
                      <div style={{ marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Subject</span>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text)' }}>{p.email_subject}</p>
                      </div>
                    )}
                    {p.email_body && (
                      <div style={{ marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Email Body</span>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text)', lineHeight: 1.6, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{p.email_body}</p>
                      </div>
                    )}
                    {p.resume_text && (
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Resume Text</span>
                        <pre style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text)', lineHeight: 1.5, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#fff', padding: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}>
                          {p.resume_text?.substring(0, 2000)}
                          {(p.resume_text?.length || 0) > 2000 ? '...' : ''}
                        </pre>
                      </div>
                    )}
                    {p.transferred_to_role && (
                      <div style={{ marginTop: 12, padding: '8px 12px', background: '#dcfce7', borderRadius: 6, fontSize: 12, color: '#166534' }}>
                        Transferred to role on {p.transferred_at ? new Date(p.transferred_at).toLocaleString() : 'N/A'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
