'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

export default function SalesDashboard() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buildingIcp, setBuildingIcp] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('prospects'); // 'prospects' | 'icp' | 'logs'
  const [message, setMessage] = useState('');

  // Apollo Key Modal & Status
  const [apolloKeyModalOpen, setApolloKeyModalOpen] = useState(false);
  const [apolloKeyInput, setApolloKeyInput] = useState('');
  const [apolloStatus, setApolloStatus] = useState({ configured: false, is_valid: false });

  // SDR Execution Settings
  const [prospectLimit, setProspectLimit] = useState(10);
  const [autoSendEmail, setAutoSendEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [icpBuilt, setIcpBuilt] = useState(false);

  // ICP Configuration State
  const [icpConfig, setIcpConfig] = useState({
    target_industries: ['Software', 'SaaS', 'Fintech'],
    target_titles: ['VP of Sales', 'CTO', 'Head of Growth'],
    company_size_min: 10,
    company_size_max: 1000,
    battlecard_notes: 'Key Differentiators: Autonomous multi-agent workflow engine, zero vendor lock-in, 99.9% uptime SLA.',
    playbook_strategy: 'Position rapid operational cost savings and 10x workflow speedup for Q3/Q4 budgeting cycles.',
  });

  // Selected Prospect Modal
  const [selectedProspect, setSelectedProspect] = useState(null);

  const [prospectSubTab, setProspectSubTab] = useState('current'); // 'current' | 'past'
  const [latestRunProspects, setLatestRunProspects] = useState([]);

  useEffect(() => {
    try {
      const cachedApollo = localStorage.getItem('sales_apollo_status');
      if (cachedApollo) {
        setApolloStatus(JSON.parse(cachedApollo));
      }
      const cachedIcp = localStorage.getItem('sales_icp_config');
      if (cachedIcp) {
        const parsed = JSON.parse(cachedIcp);
        setIcpConfig(parsed);
        setIcpBuilt(true);
      }
    } catch (e) {}

    fetchData();
    fetchIcpConfig();
    checkApolloKeyStatus();
  }, []);

  const getCurrentAndPastProspects = () => {
    if (!prospects || prospects.length === 0) {
      return { currentProspects: [], pastProspects: [] };
    }

    if (latestRunProspects && latestRunProspects.length > 0) {
      const latestEmails = new Set(latestRunProspects.map((p) => (p.contact_email || p.email || '').toLowerCase().trim()));
      const latestDomains = new Set(latestRunProspects.map((p) => (p.domain || '').toLowerCase().trim()));
      
      const current = prospects.filter((p) => 
        (p.contact_email && latestEmails.has(p.contact_email.toLowerCase().trim())) ||
        (p.domain && latestDomains.has(p.domain.toLowerCase().trim()))
      );
      const currentIds = new Set(current.map((p) => p.id));
      const past = prospects.filter((p) => !currentIds.has(p.id));
      return { currentProspects: current.length > 0 ? current : latestRunProspects, pastProspects: past };
    }

    // Fallback on page refresh: group by newest timestamp batch (created within 60s of the newest prospect)
    const newestCreatedAt = prospects[0]?.created_at ? new Date(prospects[0].created_at).getTime() : 0;
    if (!newestCreatedAt) {
      return { currentProspects: prospects, pastProspects: [] };
    }

    const current = [];
    const past = [];
    for (const p of prospects) {
      const pTime = p.created_at ? new Date(p.created_at).getTime() : 0;
      if (Math.abs(newestCreatedAt - pTime) <= 60000) {
        current.push(p);
      } else {
        past.push(p);
      }
    }
    return { currentProspects: current, pastProspects: past };
  };

  const { currentProspects, pastProspects } = getCurrentAndPastProspects();
  const displayedProspects = prospectSubTab === 'current' ? currentProspects : pastProspects;
  const safeJsonParse = async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      const cleanText = text.replace(/<[^>]*>?/gm, '').trim();
      throw new Error(cleanText ? cleanText.slice(0, 150) : `Server returned HTTP ${res.status}`);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/sales/prospects');
      const data = await safeJsonParse(res);
      setProspects(data.prospects || []);
    } catch (err) {
      console.error('Failed to fetch prospects:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchIcpConfig = async () => {
    try {
      const res = await fetch('/api/v1/sales/icp');
      const data = await safeJsonParse(res);
      if (data.success && data.icp) {
        setIcpConfig(data.icp);
        if (data.icp.target_industries && data.icp.target_industries.length > 0) {
          setIcpBuilt(true);
        }
        try { localStorage.setItem('sales_icp_config', JSON.stringify(data.icp)); } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to fetch ICP config:', err);
    }
  };

  const checkApolloKeyStatus = async () => {
    try {
      const res = await fetch('/api/v1/sales/apollo-key');
      const data = await safeJsonParse(res);
      setApolloStatus(data);
      if (data.configured) {
        try { localStorage.setItem('sales_apollo_status', JSON.stringify(data)); } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to check Apollo key:', err);
    }
  };

  const handleBuildIcp = async () => {
    setBuildingIcp(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/sales/icp/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await safeJsonParse(res);
      if (data.success && data.icp) {
        setIcpConfig(data.icp);
        setIcpBuilt(true);
        try { localStorage.setItem('sales_icp_config', JSON.stringify(data.icp)); } catch (e) {}
        setMessage('✅ Scanned Knowledge Base & built Ideal Customer Profile (ICP).');
      } else {
        setMessage(`❌ Failed to build ICP: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`❌ Network error building ICP: ${err.message}`);
    } finally {
      setBuildingIcp(false);
    }
  };

  const handleSaveApolloKey = async (e) => {
    e.preventDefault();
    if (!apolloKeyInput.trim()) return;
    try {
      const res = await fetch('/api/v1/sales/apollo-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apollo_api_key: apolloKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ Apollo API Key saved successfully.');
        const status = { configured: true, is_valid: true };
        setApolloStatus(status);
        try { localStorage.setItem('sales_apollo_status', JSON.stringify(status)); } catch (e) {}
        setApolloKeyModalOpen(false);
        setApolloKeyInput('');
      } else {
        setMessage(`❌ Failed to save key: ${data.error}`);
      }
    } catch (err) {
      setMessage(`❌ Error: ${err.message}`);
    }
  };

  const handleSaveIcpConfig = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/sales/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(icpConfig),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ ICP strategy updated.');
      } else {
        setMessage(`❌ Failed to update ICP: ${data.error}`);
      }
    } catch (err) {
      setMessage(`❌ Error saving ICP: ${err.message}`);
    }
  };

  const handleRunPipeline = async (e) => {
    e.preventDefault();
    setRunningPipeline(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/sales/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_limit: prospectLimit,
          auto_send_email: autoSendEmail,
          icp_config: icpConfig,
        }),
      });
      const data = await safeJsonParse(res);
      if (data.success && data.result) {
        const result = data.result;
        setLogs(result.logs || []);
        if ((result.processed_count || 0) > 0) {
          setMessage(`✅ Campaign completed! Discovered & verified ${result.processed_count} 100% VALID deliverable prospect profiles.`);
        } else {
          setMessage(`⚠️ Campaign completed safely: 0 unverified synthetic emails saved to protect domain deliverability. Configure an Apollo API Key to source real executive emails.`);
        }
        const batch = (result.outreach_batch && result.outreach_batch.length > 0) ? result.outreach_batch : (result.prospects || []);
        setLatestRunProspects(batch);
        setProspectSubTab('current');
        fetchData();
      } else {
        setMessage(`❌ Campaign execution failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`❌ Network error: ${err.message}`);
    } finally {
      setRunningPipeline(false);
    }
  };

  const handleSendSingleEmail = async (prospect) => {
    if (!prospect || !prospect.contact_email) return;
    setSendingEmail(true);
    try {
      const res = await fetch('/api/v1/sales/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospect.id,
          contact_email: prospect.contact_email,
          subject: prospect.subject || prospect.outreach_subject || 'Partnership Proposal',
          body: prospect.body || prospect.outreach_body || '',
        }),
      });
      const data = await safeJsonParse(res);
      if (data.success) {
        setMessage(`✅ Email successfully dispatched to ${prospect.contact_email} via Gmail API!`);
        // Update prospect state locally
        setProspects((prev) =>
          prev.map((p) =>
            p.contact_email === prospect.contact_email
              ? {
                  ...p,
                  deal_stage: 'OUTREACH_SENT',
                  subject: prospect.subject || prospect.outreach_subject,
                  outreach_subject: prospect.subject || prospect.outreach_subject,
                  body: prospect.body || prospect.outreach_body,
                  outreach_body: prospect.body || prospect.outreach_body,
                }
              : p
          )
        );
        setSelectedProspect(null);
      } else {
        alert(`❌ Email dispatch failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`❌ Network error: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="border-b border-outline-variant bg-surface px-lg py-md flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors flex items-center">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">person_search</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">Sales Agent</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Autonomous Sourcing, Deliverability Verification & Outreach</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setApolloKeyModalOpen(true)}
              className={`px-md py-sm rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2 border ${
                apolloStatus.configured
                  ? 'bg-surface-variant text-primary border-outline-variant'
                  : 'bg-primary text-on-primary border-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">key</span>
              {apolloStatus.configured ? 'Apollo Configured' : 'Set Apollo Key'}
            </button>

            <button
              onClick={fetchData}
              className="px-md py-sm bg-surface-variant hover:bg-outline-variant rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh
            </button>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1 flex overflow-hidden p-lg gap-lg">
          {/* Left Form / Workflow Controls Panel */}
          <div className="w-1/3 bg-surface border border-outline-variant rounded-lg p-md flex flex-col gap-md overflow-y-auto">
            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">psychology</span> Step 1: Knowledge Base ICP
            </h2>

            {message && (
              <div className="p-sm bg-surface-variant border border-outline-variant rounded-md text-body-sm">
                {message}
              </div>
            )}

            {/* Step 1: Build ICP Button */}
            <button
              type="button"
              onClick={handleBuildIcp}
              disabled={buildingIcp}
              className="w-full py-md bg-secondary hover:bg-secondary/90 text-on-secondary font-label-md rounded-md transition-colors flex items-center justify-center gap-2"
            >
              {buildingIcp ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> Scanning Knowledge Base...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">auto_fix_high</span> Build ICP from Knowledge Base
                </>
              )}
            </button>

            {/* Display Active ICP Summary */}
            <div className="p-sm bg-background border border-outline-variant rounded-md flex flex-col gap-xs text-body-sm">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-on-surface">Target ICP:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${icpBuilt ? 'bg-green-900/40 text-green-300' : 'bg-surface-variant text-on-surface-variant'}`}>
                  {icpBuilt ? 'ICP Ready' : 'Pending Build'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Industries:</span>
                <span className="font-bold text-right">{icpConfig.target_industries?.slice(0, 2).join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Roles:</span>
                <span className="font-bold text-right">{icpConfig.target_titles?.slice(0, 2).join(', ')}</span>
              </div>
            </div>

            <hr className="border-outline-variant my-xs" />

            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">tune</span> Step 2: Campaign Settings
            </h2>

            <form onSubmit={handleRunPipeline} className="flex flex-col gap-md">
              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Profiles Stop Limit</label>
                <select
                  value={prospectLimit}
                  onChange={(e) => setProspectLimit(parseInt(e.target.value))}
                  className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                >
                  <option value={5}>Stop at 5 Prospect Profiles</option>
                  <option value={10}>Stop at 10 Prospect Profiles</option>
                  <option value={25}>Stop at 25 Prospect Profiles</option>
                  <option value={50}>Stop at 50 Prospect Profiles</option>
                  <option value={100}>Continuous / Keep Going (100 Max)</option>
                </select>
              </div>

              {/* Auto-Send Emails Toggle */}
              <div className="flex items-center justify-between p-sm bg-background border border-outline-variant rounded-md">
                <div>
                  <span className="text-body-sm font-label-md text-on-surface block font-bold">Auto-Send Emails</span>
                  <span className="text-xs text-on-surface-variant">Dispatch via Gmail automatically</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSendEmail}
                    onChange={(e) => setAutoSendEmail(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <button
                type="submit"
                disabled={runningPipeline}
                className="py-md bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded-md transition-colors flex items-center justify-center gap-2"
              >
                {runningPipeline ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> Running SDR Campaign...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span> Start SDR Campaign
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Data Views Panel */}
          <div className="flex-1 bg-surface border border-outline-variant rounded-lg p-md flex flex-col overflow-hidden">
            {/* Tabs Header */}
            <div className="flex border-b border-outline-variant mb-md gap-md">
              <button
                onClick={() => setActiveTab('prospects')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors ${
                  activeTab === 'prospects' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Discovered Prospects ({prospects.length})
              </button>
              <button
                onClick={() => setActiveTab('icp')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors ${
                  activeTab === 'icp' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Generated ICP Details
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors ${
                  activeTab === 'logs' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Execution Audit Log ({logs.length})
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto">
              {/* TAB 1: Discovered Prospects Matrix with Sub-Tabs */}
              {activeTab === 'prospects' && (
                <div className="flex flex-col gap-sm">
                  {/* Sub-Tabs Navigation Pills: Current vs Past */}
                  <div className="flex items-center justify-between pb-sm border-b border-outline-variant/60">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setProspectSubTab('current')}
                        className={`px-3 py-1.5 text-xs font-label-md rounded-md transition-all flex items-center gap-1.5 ${
                          prospectSubTab === 'current'
                            ? 'bg-primary text-on-primary font-bold shadow'
                            : 'bg-surface-variant/70 text-on-surface-variant hover:bg-outline-variant/60'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">auto_mode</span>
                        Current Run ({currentProspects.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => setProspectSubTab('past')}
                        className={`px-3 py-1.5 text-xs font-label-md rounded-md transition-all flex items-center gap-1.5 ${
                          prospectSubTab === 'past'
                            ? 'bg-primary text-on-primary font-bold shadow'
                            : 'bg-surface-variant/70 text-on-surface-variant hover:bg-outline-variant/60'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">history</span>
                        Past Runs ({pastProspects.length})
                      </button>
                    </div>

                    <span className="text-xs text-on-surface-variant italic">
                      {prospectSubTab === 'current'
                        ? 'Showing results of the latest campaign run'
                        : 'Showing all leads from previous campaign runs'}
                    </span>
                  </div>

                  {loading ? (
                    <p className="text-on-surface-variant font-body-sm italic p-md text-center">Loading prospects...</p>
                  ) : displayedProspects.length === 0 ? (
                    <div className="p-xl text-center flex flex-col items-center justify-center gap-xs">
                      <span className="material-symbols-outlined text-outline text-[36px]">inbox</span>
                      <p className="text-on-surface-variant font-body-sm italic m-0">
                        {prospectSubTab === 'current'
                          ? 'No prospect records in the current campaign run. Click "Start SDR Campaign" to launch a run.'
                          : 'No previous campaign run records found.'}
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-body-sm">
                      <thead>
                        <tr className="border-b border-outline-variant text-on-surface-variant font-label-md">
                          <th className="p-sm">Company</th>
                          <th className="p-sm">Contact</th>
                          <th className="p-sm">Email</th>
                          <th className="p-sm">Deliverability</th>
                          <th className="p-sm">ICP Score</th>
                          <th className="p-sm">Stage</th>
                          <th className="p-sm text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedProspects.map((p, idx) => (
                          <tr key={idx} className="border-b border-outline-variant/50 hover:bg-surface-variant/30">
                            <td className="p-sm">
                              <div className="font-bold text-on-surface">{p.company_name}</div>
                              <div className="text-xs text-on-surface-variant">{p.domain}</div>
                            </td>
                            <td className="p-sm">
                              <div>{p.contact_name || 'Executive'}</div>
                              <div className="text-xs text-on-surface-variant">{p.contact_title || 'Decision Maker'}</div>
                            </td>
                            <td className="p-sm font-mono text-xs">{p.contact_email}</td>
                            <td className="p-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                p.deliverability_status === 'VALID' ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/40 text-yellow-300'
                              }`}>
                                {p.deliverability_status || 'VALID'}
                              </span>
                            </td>
                            <td className="p-sm font-bold text-primary">{p.icp_score || 90}/100</td>
                            <td className="p-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                p.deal_stage === 'OUTREACH_SENT'
                                  ? 'bg-blue-900/40 text-blue-300'
                                  : p.deal_stage === 'DISCOVERED'
                                  ? 'bg-purple-900/40 text-purple-300'
                                  : 'bg-surface-variant text-on-surface-variant'
                              }`}>
                                {p.deal_stage || 'DISCOVERED'}
                              </span>
                            </td>
                            <td className="p-sm text-right">
                              <button
                                onClick={() => setSelectedProspect(p)}
                                className="px-2.5 py-1 bg-surface-variant hover:bg-outline-variant text-on-surface rounded text-xs font-medium"
                              >
                                View Outreach
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* TAB 2: Generated ICP Details */}
              {activeTab === 'icp' && (
                <form onSubmit={handleSaveIcpConfig} className="flex flex-col gap-md max-w-xl">
                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Target Industries (Comma-separated)</label>
                    <input
                      type="text"
                      value={Array.isArray(icpConfig.target_industries) ? icpConfig.target_industries.join(', ') : icpConfig.target_industries}
                      onChange={(e) => setIcpConfig({ ...icpConfig, target_industries: e.target.value.split(',').map(s => s.trim()) })}
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Target Role Titles (Comma-separated)</label>
                    <input
                      type="text"
                      value={Array.isArray(icpConfig.target_titles) ? icpConfig.target_titles.join(', ') : icpConfig.target_titles}
                      onChange={(e) => setIcpConfig({ ...icpConfig, target_titles: e.target.value.split(',').map(s => s.trim()) })}
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Battlecard & Value Prop Differentiators</label>
                    <textarea
                      rows={3}
                      value={icpConfig.battlecard_notes || ''}
                      onChange={(e) => setIcpConfig({ ...icpConfig, battlecard_notes: e.target.value })}
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                    />
                  </div>

                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Outreach Playbook Strategy</label>
                    <textarea
                      rows={3}
                      value={icpConfig.playbook_strategy || ''}
                      onChange={(e) => setIcpConfig({ ...icpConfig, playbook_strategy: e.target.value })}
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    className="py-sm px-md bg-primary text-on-primary font-label-md rounded-md w-fit"
                  >
                    Save ICP Adjustments
                  </button>
                </form>
              )}

              {/* TAB 3: Execution Audit Logs */}
              {activeTab === 'logs' && (
                <div className="flex flex-col gap-sm">
                  {logs.length === 0 ? (
                    <p className="text-on-surface-variant font-body-sm italic p-md text-center">No logs captured for this session.</p>
                  ) : (
                    logs.map((l, idx) => (
                      <div key={idx} className="p-sm bg-background border border-outline-variant rounded-md text-body-sm">
                        <div className="font-bold text-primary mb-1">{l.stage} — {l.status}</div>
                        <div className="text-on-surface-variant">{l.details}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Apollo Key Modal */}
        {apolloKeyModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-outline-variant rounded-lg p-lg max-w-md w-full shadow-lg">
              <div className="flex justify-between items-center mb-md">
                <h3 className="font-title-md text-on-surface m-0">Set Apollo API Key</h3>
                <button onClick={() => setApolloKeyModalOpen(false)} className="text-on-surface-variant font-bold">✕</button>
              </div>

              <form onSubmit={handleSaveApolloKey} className="flex flex-col gap-md">
                <div>
                  <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Apollo Master API Key</label>
                  <input
                    type="password"
                    placeholder="apollo_api_key_..."
                    value={apolloKeyInput}
                    onChange={(e) => setApolloKeyInput(e.target.value)}
                    className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                    required
                  />
                </div>

                <div className="flex justify-end gap-sm">
                  <button
                    type="button"
                    onClick={() => setApolloKeyModalOpen(false)}
                    className="px-md py-sm bg-surface-variant text-on-surface rounded-md text-body-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-md py-sm bg-primary text-on-primary rounded-md text-body-sm font-label-md"
                  >
                    Save Key
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Prospect Detail Inspection Modal */}
        {selectedProspect && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-outline-variant rounded-lg p-lg max-w-lg w-full shadow-lg overflow-y-auto max-h-[85vh]">
              <div className="flex justify-between items-center mb-md">
                <div>
                  <h3 className="font-title-md text-on-surface m-0">{selectedProspect.company_name}</h3>
                  <div className="text-xs text-on-surface-variant">{selectedProspect.domain}</div>
                </div>
                <button onClick={() => setSelectedProspect(null)} className="text-on-surface-variant font-bold">✕</button>
              </div>

              <div className="flex flex-col gap-md text-body-sm">
                <div className="p-sm bg-background border border-outline-variant rounded-md">
                  <div>Contact: <strong>{selectedProspect.contact_name}</strong> ({selectedProspect.contact_title})</div>
                  <div>Email: <span className="font-mono text-primary">{selectedProspect.contact_email}</span></div>
                </div>

                <div>
                  <label className="font-bold block mb-1">Generated Subject</label>
                  <input
                    type="text"
                    value={selectedProspect.subject !== undefined ? selectedProspect.subject : (selectedProspect.outreach_subject || '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedProspect({
                        ...selectedProspect,
                        subject: val,
                        outreach_subject: val,
                      });
                    }}
                    className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold block mb-1">Generated Body</label>
                  <textarea
                    rows={10}
                    value={selectedProspect.body !== undefined ? selectedProspect.body : (selectedProspect.outreach_body || '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedProspect({
                        ...selectedProspect,
                        body: val,
                        outreach_body: val,
                      });
                    }}
                    className="w-full p-md bg-background border border-outline rounded-md text-on-surface text-xs font-mono leading-relaxed"
                  />
                </div>
              </div>

              <div className="mt-lg flex justify-end gap-md">
                <button
                  type="button"
                  onClick={() => setSelectedProspect(null)}
                  className="px-md py-sm bg-surface-variant hover:bg-outline-variant text-on-surface rounded-md text-body-sm font-label-md"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={() => handleSendSingleEmail(selectedProspect)}
                  disabled={sendingEmail}
                  className="px-md py-sm bg-primary hover:bg-primary/90 text-on-primary rounded-md text-body-sm font-label-md flex items-center gap-2"
                >
                  {sendingEmail ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> Transmitting...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">send</span> Send Email
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
