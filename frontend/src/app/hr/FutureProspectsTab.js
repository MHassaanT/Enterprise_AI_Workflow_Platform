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

  const renderStatusBadge = (status) => {
    const map = {
      pooled: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      transferred: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      notified: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${map[status] || 'bg-surface-container text-on-surface-variant'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-8 w-full">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface border border-outline-variant rounded-xl p-6">
          <div>
            <h2 className="font-headline-md text-on-surface mb-1">Future Prospects (Talent Pool)</h2>
            <p className="text-sm text-on-surface-variant">
              Applicants who applied for positions not currently open. When relevant roles open, the HR agent will automatically match and notify them.
            </p>
          </div>
          {roles.length > 0 && (
            <select
              onChange={e => { if (e.target.value) handleScanForRole(e.target.value); e.target.value = ''; }}
              className="bg-surface-container border border-outline-variant text-on-surface text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">🔍 Scan Pool for Open Role...</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Ingested', count: prospects.length, color: 'text-on-surface' },
            { label: 'Pooled', count: prospects.filter(p => p.status === 'pooled').length, color: 'text-amber-400' },
            { label: 'Transferred', count: prospects.filter(p => p.status === 'transferred').length, color: 'text-emerald-400' },
            { label: 'Notified', count: prospects.filter(p => p.status === 'notified').length, color: 'text-blue-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.count}</p>
              </div>
              <span className="material-symbols-outlined text-surface-container-highest text-[28px]">groups</span>
            </div>
          ))}
        </div>

        {/* Filter Input */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[18px]">search</span>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search by name, email, or desired role..."
              className="w-full bg-surface border border-outline-variant rounded-lg pl-9 pr-4 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Prospects List */}
        {loading ? (
          <div className="text-center py-12 text-on-surface-variant">Loading prospects...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface border border-outline-variant rounded-xl border-dashed">
            <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">person_search</span>
            <p className="text-sm font-medium">No prospects in the talent pool.</p>
            <p className="text-xs mt-1">When applications arrive via email for unmatched roles, they will automatically accumulate here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => (
              <div key={p.id} className="bg-surface border border-outline-variant rounded-xl overflow-hidden transition-all">
                <div
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-surface-container-low transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-primary-container/30 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                    {(p.applicant_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium text-on-surface text-sm truncate">{p.applicant_name}</h4>
                      {renderStatusBadge(p.status)}
                    </div>
                    <p className="text-xs text-on-surface-variant truncate">{p.applicant_email}</p>
                  </div>
                  {p.desired_role && (
                    <span className="text-xs px-2.5 py-1 bg-secondary-container/50 text-secondary-fixed rounded-md border border-outline-variant">
                      {p.desired_role}
                    </span>
                  )}
                  <span className="text-xs text-on-surface-variant whitespace-nowrap hidden sm:inline">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    className="text-on-surface-variant hover:text-error p-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${expandedId === p.id ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </div>

                {expandedId === p.id && (
                  <div className="p-4 border-t border-outline-variant bg-surface-container-low space-y-3 text-xs text-on-surface-variant">
                    {p.email_subject && (
                      <div>
                        <span className="font-semibold text-on-surface uppercase tracking-wider text-[10px]">Email Subject</span>
                        <p className="text-on-surface text-sm mt-0.5">{p.email_subject}</p>
                      </div>
                    )}
                    {p.email_body && (
                      <div>
                        <span className="font-semibold text-on-surface uppercase tracking-wider text-[10px]">Email Message Body</span>
                        <p className="text-on-surface bg-surface p-3 rounded-lg border border-outline-variant mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {p.email_body}
                        </p>
                      </div>
                    )}
                    {p.resume_text && (
                      <div>
                        <span className="font-semibold text-on-surface uppercase tracking-wider text-[10px]">Parsed Resume / Application Details</span>
                        <pre className="text-on-surface bg-surface p-3 rounded-lg border border-outline-variant mt-1 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono text-[11px]">
                          {p.resume_text?.substring(0, 2000)}
                        </pre>
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
