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
    try {
      setScanning(true);
      const result = await scanTalentPool(activeRoleId);
      alert(`Transferred ${result.transferred} prospect(s) from talent pool.`);
      loadRoleDetails(activeRoleId);
    } catch (e) { alert(e.message); }
    finally { setScanning(false); }
  };

  const renderStatusBadge = (status) => {
    const map = {
      open: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      closed: 'bg-red-500/10 text-red-400 border-red-500/20',
      filled: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${map[status] || 'bg-surface-container text-on-surface-variant'}`}>
        {status}
      </span>
    );
  };

  const renderAppStatusBadge = (status) => {
    const map = {
      received: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      ready: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      shortlisted: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold capitalize border ${map[status] || 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
        {status?.replace('_', ' ')}
      </span>
    );
  };

  const renderScoreBar = (score) => {
    if (score == null) return <span className="text-on-surface-variant text-xs">Not scored</span>;
    const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-400' : 'bg-red-500';
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-surface-container-high h-2 rounded-full overflow-hidden">
          <div className={`${color} h-full transition-all duration-800`} style={{ width: `${score}%` }}></div>
        </div>
        <span className="text-xs font-mono font-bold text-on-surface min-w-[36px]">{score}/100</span>
      </div>
    );
  };

  const daysRemaining = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="flex flex-1 overflow-hidden w-full">
      {/* Sidebar — Open Roles */}
      <div className="w-80 border-r border-outline-variant bg-surface-container-low flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-outline-variant">
          <button
            onClick={() => { setShowCreateForm(true); setActiveRoleId(null); }}
            className="w-full py-2 px-4 bg-primary text-on-primary rounded font-label-md font-semibold hover:bg-primary-container transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span> Open New Role
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-on-surface-variant text-center p-4">Loading roles...</p>
          ) : roles.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center p-4">No open roles yet. Create one to start receiving applications via email.</p>
          ) : (
            roles.map(role => {
              const days = daysRemaining(role.accepting_until);
              const isActive = activeRoleId === role.id && !showCreateForm;
              return (
                <div
                  key={role.id}
                  onClick={() => { loadRoleDetails(role.id); setShowCreateForm(false); }}
                  className={`p-3.5 rounded-lg border cursor-pointer group transition-colors relative ${
                    isActive ? 'bg-primary-container/20 border-primary/50' : 'bg-surface border-outline-variant hover:border-outline'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1 pr-6">
                    <h3 className="font-label-md text-on-surface truncate font-semibold">{role.title}</h3>
                    {renderStatusBadge(role.status)}
                  </div>
                  <div className="flex gap-3 text-xs text-on-surface-variant mt-2">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">group</span>
                      {role.application_count || 0} apps
                    </span>
                    {role.status === 'open' && days != null && (
                      <span className={`flex items-center gap-1 ${days <= 3 ? 'text-error font-medium' : days <= 7 ? 'text-amber-400' : ''}`}>
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        {days > 0 ? `${days}d left` : 'Expired'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(role.id); }}
                    className="absolute top-3 right-3 text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-8">
        {showCreateForm ? (
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="font-headline-md text-on-surface">Open New Role for Email Applications</h2>
            <form onSubmit={handleCreate} className="space-y-5 bg-surface border border-outline-variant rounded-xl p-6">
              <div>
                <label className="block font-label-md text-on-surface mb-2">Role Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-4 py-2 text-on-surface focus:outline-none focus:border-primary text-sm"
                  placeholder="e.g. Senior Backend Engineer"
                />
              </div>
              <div>
                <label className="block font-label-md text-on-surface mb-2">Full Description</label>
                <textarea
                  required
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={5}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-4 py-2 text-on-surface focus:outline-none focus:border-primary text-sm resize-none"
                  placeholder="Paste the full job description..."
                />
              </div>
              <div>
                <label className="block font-label-md text-on-surface mb-2">Requirements (Optional)</label>
                <textarea
                  value={form.requirements}
                  onChange={e => setForm({ ...form, requirements: e.target.value })}
                  rows={3}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-4 py-2 text-on-surface focus:outline-none focus:border-primary text-sm resize-none"
                  placeholder="Key skills or qualifications..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-md text-on-surface mb-2">Accepting Applications Until</label>
                  <input
                    type="date"
                    required
                    value={form.accepting_until}
                    onChange={e => setForm({ ...form, accepting_until: e.target.value })}
                    className="w-full bg-surface-container border border-outline-variant rounded-md px-4 py-2 text-on-surface focus:outline-none focus:border-primary text-sm"
                  />
                </div>
                <div>
                  <label className="block font-label-md text-on-surface mb-2">Gmail Search Query</label>
                  <input
                    type="text"
                    value={form.search_query}
                    onChange={e => setForm({ ...form, search_query: e.target.value })}
                    className="w-full bg-surface-container border border-outline-variant rounded-md px-4 py-2 text-on-surface focus:outline-none focus:border-primary text-sm"
                    placeholder="subject:job application"
                  />
                </div>
              </div>
              <div className="bg-primary-container/10 border border-primary/30 rounded-lg p-3 text-xs text-on-surface-variant flex gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">info</span>
                <div>The HR Agent will automatically poll your connected Gmail every 60 seconds using the search query. Unmatched applications default to Future Prospects.</div>
              </div>
              <button
                type="submit"
                className="px-6 py-2.5 bg-primary text-on-primary rounded font-label-md font-semibold hover:bg-primary-container transition-colors"
              >
                Create Role & Start Polling
              </button>
            </form>
          </div>
        ) : activeRoleId && activeRole ? (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-surface border border-outline-variant rounded-xl p-6">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-headline-md text-on-surface">{activeRole.title}</h2>
                    {renderStatusBadge(activeRole.status)}
                  </div>
                  <p className="text-sm text-on-surface-variant max-w-3xl">{activeRole.description}</p>
                </div>
                <div className="flex gap-2">
                  {activeRole.status === 'open' && (
                    <button
                      onClick={() => handleCloseRole(activeRoleId)}
                      className="px-3 py-1.5 border border-error/50 text-error rounded-md text-xs font-semibold hover:bg-error/10 transition-colors"
                    >
                      Close Role
                    </button>
                  )}
                  <button
                    onClick={handleScanPool}
                    disabled={scanning}
                    className="px-3 py-1.5 bg-secondary text-on-secondary rounded-md text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">search</span>
                    {scanning ? 'Scanning...' : 'Scan Talent Pool'}
                  </button>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-on-surface-variant pt-2 border-t border-outline-variant/50">
                <span>Deadline: <strong className="text-on-surface">{new Date(activeRole.accepting_until).toLocaleDateString()}</strong></span>
                <span>Gmail Filter: <code className="bg-surface-container px-1.5 py-0.5 rounded text-primary">{activeRole.search_query}</code></span>
              </div>
            </div>

            {/* Applications Table */}
            <div className="bg-surface border border-outline-variant rounded-xl p-6 overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline-sm text-on-surface">Ingested Applications ({applications.length})</h3>
                <button
                  onClick={handleRank}
                  disabled={ranking || applications.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container disabled:opacity-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">magic_button</span>
                  {ranking ? 'Ranking...' : 'Rank Applications'}
                </button>
              </div>

              {applications.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant bg-surface-container-low rounded-lg border border-outline-variant border-dashed">
                  <span className="material-symbols-outlined text-[36px] mb-2 opacity-50">mark_email_read</span>
                  <p className="text-sm font-medium">No applications received yet via email polling.</p>
                  <p className="text-xs mt-1">When matching emails arrive in your Gmail, they will be automatically parsed and classified here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant text-on-surface-variant font-label-sm uppercase tracking-wider">
                        <th className="p-3">Applicant</th>
                        <th className="p-3 w-44">Match Score</th>
                        <th className="p-3">Source</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Ack Email</th>
                        <th className="p-3">Received</th>
                      </tr>
                    </thead>
                    <tbody className="align-top text-sm">
                      {applications.map(app => (
                        <tr key={app.id} className="border-b border-outline-variant/50 hover:bg-surface-container-low transition-colors">
                          <td className="p-3">
                            <div className="font-medium text-on-surface">{app.applicant_name}</div>
                            <div className="text-xs text-on-surface-variant">{app.applicant_email}</div>
                            {app.rank_reasoning && (
                              <div className="mt-1.5 text-xs text-on-surface-variant italic bg-surface-container p-2 rounded max-w-md">
                                "{app.rank_reasoning}"
                              </div>
                            )}
                          </td>
                          <td className="p-3">{renderScoreBar(app.rank_score)}</td>
                          <td className="p-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                              app.source === 'talent_pool_transfer'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            }`}>
                              {app.source === 'talent_pool_transfer' ? 'Pool Transfer' : 'Gmail'}
                            </span>
                          </td>
                          <td className="p-3">{renderAppStatusBadge(app.status)}</td>
                          <td className="p-3">
                            {app.ack_email_sent ? (
                              <span className="text-emerald-400 flex items-center gap-1 text-xs" title={`Sent ${new Date(app.ack_email_sent_at).toLocaleString()}`}>
                                <span className="material-symbols-outlined text-[16px]">check_circle</span> Sent
                              </span>
                            ) : (
                              <span className="text-on-surface-variant text-xs">Pending</span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-on-surface-variant">
                            {new Date(app.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-on-surface-variant py-16">
            <span className="material-symbols-outlined text-[64px] opacity-30 mb-4">inbox</span>
            <h3 className="font-headline-sm text-on-surface mb-2">Email Application Intake</h3>
            <p className="text-sm max-w-md text-center">Select an open role from the sidebar or create a new role to start monitoring incoming job application emails.</p>
          </div>
        )}
      </div>
    </div>
  );
}
