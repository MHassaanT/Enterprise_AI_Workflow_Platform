'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

export default function SalesDashboard() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('pipeline'); // 'pipeline' | 'icp' | 'logs'
  const [notification, setNotification] = useState('');

  // Apollo Key Modal & Status
  const [apolloKeyModalOpen, setApolloKeyModalOpen] = useState(false);
  const [apolloKeyInput, setApolloKeyInput] = useState('');
  const [apolloStatus, setApolloStatus] = useState({ configured: false, is_valid: false });

  // Autonomous SDR Input Form
  const [targetDomainInput, setTargetDomainInput] = useState('');

  // ICP Configuration State
  const [icpConfig, setIcpConfig] = useState({
    target_industries: ['Software', 'SaaS', 'Fintech', 'Healthcare'],
    target_titles: ['VP of Sales', 'CTO', 'Head of Growth', 'Director of IT'],
    company_size_min: 10,
    company_size_max: 1000,
    battlecard_notes: 'Key Differentiators: Autonomous multi-agent workflow engine, zero vendor lock-in, 99.9% uptime SLA.',
    playbook_strategy: 'Position rapid operational cost savings and 10x workflow speedup for Q3/Q4 budgeting cycles.',
  });

  // Selected Prospect Detail Modal
  const [selectedProspect, setSelectedProspect] = useState(null);

  useEffect(() => {
    fetchProspects();
    fetchIcpConfig();
    checkApolloKeyStatus();
  }, []);

  const fetchProspects = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/sales/prospects');
      const data = await res.json();
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
      const data = await res.json();
      if (data.success && data.icp) {
        setIcpConfig(data.icp);
      }
    } catch (err) {
      console.error('Failed to fetch ICP config:', err);
    }
  };

  const checkApolloKeyStatus = async () => {
    try {
      const res = await fetch('/api/v1/sales/apollo-key');
      const data = await res.json();
      setApolloStatus(data);
    } catch (err) {
      console.error('Failed to check Apollo key:', err);
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
        setNotification('✅ Apollo Master API Key saved successfully!');
        setApolloStatus({ configured: true, is_valid: true });
        setApolloKeyModalOpen(false);
        setApolloKeyInput('');
      } else {
        setNotification(`❌ Failed to save key: ${data.error}`);
      }
    } catch (err) {
      setNotification(`❌ Error: ${err.message}`);
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
        setNotification('✅ ICP criteria updated successfully!');
      } else {
        setNotification(`❌ Failed to update ICP: ${data.error}`);
      }
    } catch (err) {
      setNotification(`❌ Error saving ICP: ${err.message}`);
    }
  };

  const handleRunPipeline = async (e) => {
    e.preventDefault();
    setRunningPipeline(true);
    setNotification('');
    try {
      const res = await fetch('/api/v1/sales/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_domain: targetDomainInput.trim() || null,
          icp_config: icpConfig,
        }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        const result = data.result;
        setLogs(result.logs || []);
        setNotification(`🎉 Pipeline completed! ICP Fit Score: ${result.icp_score}/100. Dispatched email via Gmail.`);
        fetchProspects();
        setTargetDomainInput('');
      } else {
        setNotification(`❌ Pipeline execution failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setNotification(`❌ Network error: ${err.message}`);
    } finally {
      setRunningPipeline(false);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#0b0f19] text-gray-100 font-sans flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="border-b border-gray-800 bg-[#111827] px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-indigo-400 transition-colors flex items-center">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <span className="material-symbols-outlined text-[24px]">person_search</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  AI Sales Agent <span className="text-xs bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full font-mono">AI SDR / BDR</span>
                </h1>
                <p className="text-xs text-gray-400 m-0">Autonomous Sourcing, Crawl4AI Fit Checking, Email Verification & Personalization Engine</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Apollo API Key Badge */}
            <button
              id="apollo_key_btn"
              onClick={() => setApolloKeyModalOpen(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all ${
                apolloStatus.configured
                  ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/60 hover:bg-emerald-900/50'
                  : 'bg-amber-950/50 text-amber-300 border-amber-800/60 hover:bg-amber-900/50 animate-pulse'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">key</span>
              {apolloStatus.configured ? 'Apollo Connected' : 'Configure Apollo API Key'}
            </button>

            <button
              id="refresh_prospects_btn"
              onClick={fetchProspects}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span> Refresh
            </button>
          </div>
        </header>

        {/* 6-Stage Visual Execution Pipeline Header Bar */}
        <div className="bg-[#151c2c] border-b border-gray-800/80 px-6 py-2.5 flex items-center justify-between text-xs overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-gray-400 font-semibold uppercase tracking-wider text-[10px]">6-Stage SDR Pipeline:</span>
            
            <span className="px-2.5 py-1 bg-indigo-900/40 text-indigo-300 border border-indigo-800/50 rounded-md font-mono flex items-center gap-1">
              1. Apollo Sourcing
            </span>
            <span className="text-gray-600">→</span>
            <span className="px-2.5 py-1 bg-cyan-900/40 text-cyan-300 border border-cyan-800/50 rounded-md font-mono flex items-center gap-1">
              2. Crawl4AI Account Check
            </span>
            <span className="text-gray-600">→</span>
            <span className="px-2.5 py-1 bg-blue-900/40 text-blue-300 border border-blue-800/50 rounded-md font-mono flex items-center gap-1">
              3. Contact Discovery
            </span>
            <span className="text-gray-600">→</span>
            <span className="px-2.5 py-1 bg-purple-900/40 text-purple-300 border border-purple-800/50 rounded-md font-mono flex items-center gap-1">
              4. Deliverability Guard
            </span>
            <span className="text-gray-600">→</span>
            <span className="px-2.5 py-1 bg-amber-900/40 text-amber-300 border border-amber-800/50 rounded-md font-mono flex items-center gap-1">
              5. OpenRouter Scoring & Copy
            </span>
            <span className="text-gray-600">→</span>
            <span className="px-2.5 py-1 bg-emerald-900/40 text-emerald-300 border border-emerald-800/50 rounded-md font-mono flex items-center gap-1">
              6. Gmail Outreach & CRM
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-gray-900/80 p-1 rounded-lg border border-gray-800 ml-4 flex-shrink-0">
            <button
              id="tab_pipeline_btn"
              onClick={() => setActiveTab('pipeline')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'pipeline' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Lead Pipeline & CRM ({prospects.length})
            </button>
            <button
              id="tab_icp_btn"
              onClick={() => setActiveTab('icp')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'icp' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              ICP Strategy Setup
            </button>
            <button
              id="tab_logs_btn"
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'logs' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Audit Trail ({logs.length})
            </button>
          </div>
        </div>

        {/* Global Notification Banner */}
        {notification && (
          <div className="bg-indigo-950/80 border-b border-indigo-800 px-6 py-2 text-xs text-indigo-200 flex items-center justify-between">
            <span>{notification}</span>
            <button onClick={() => setNotification('')} className="text-indigo-400 hover:text-indigo-100 font-bold ml-4">✕</button>
          </div>
        )}

        {/* Main Content Body */}
        <main className="flex-1 flex overflow-hidden p-6 gap-6">
          {/* Left Panel: Autonomous Trigger & Controls */}
          <div className="w-80 bg-[#111827] border border-gray-800 rounded-xl p-5 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-indigo-400 text-[20px]">bolt</span> Trigger AI SDR Pipeline
              </h2>
              <p className="text-xs text-gray-400 mt-1 mb-0">
                Autonomous SDR executes sourcing, Crawl4AI website evaluation, contact enrichment, deliverability verification, copy writing, and Gmail outreach.
              </p>
            </div>

            <form onSubmit={handleRunPipeline} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-300 font-semibold block mb-1">Target Domain (Optional)</label>
                <input
                  id="target_domain_input"
                  type="text"
                  placeholder="e.g. acmecloud.com"
                  value={targetDomainInput}
                  onChange={(e) => setTargetDomainInput(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Leave empty to auto-source top ICP candidate accounts via Apollo.</span>
              </div>

              <div className="bg-gray-900/60 p-3 rounded-lg border border-gray-800/80 flex flex-col gap-1.5 text-[11px] text-gray-400">
                <div className="flex justify-between">
                  <span>Target Industries:</span>
                  <span className="text-gray-200 font-semibold">{icpConfig.target_industries?.slice(0, 2).join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Target Roles:</span>
                  <span className="text-gray-200 font-semibold">{icpConfig.target_titles?.slice(0, 2).join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deliverability Check:</span>
                  <span className="text-emerald-400 font-semibold">Enabled (email-verifier)</span>
                </div>
              </div>

              <button
                id="run_pipeline_btn"
                type="submit"
                disabled={runningPipeline}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
              >
                {runningPipeline ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> Autonomous SDR Running...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span> Run SDR Lead Campaign
                  </>
                )}
              </button>
            </form>

            <hr className="border-gray-800 my-1" />

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Key Efficiency Principles</h3>
              <ul className="text-[11px] text-gray-400 space-y-1.5 pl-4 list-disc">
                <li><strong className="text-gray-200">Credit Protection:</strong> Scrapes site with Crawl4AI before burning email verification credits.</li>
                <li><strong className="text-gray-200">Email Waterfall:</strong> Validates syntax, MX DNS records, & disposable providers.</li>
                <li><strong className="text-gray-200">Structured Output:</strong> OpenRouter LLM calculates 0-100 ICP fit score & drafts outreach.</li>
              </ul>
            </div>
          </div>

          {/* Right Panel: Content Area */}
          <div className="flex-1 bg-[#111827] border border-gray-800 rounded-xl p-5 flex flex-col overflow-hidden">
            {/* TAB 1: Lead Pipeline & CRM */}
            {activeTab === 'pipeline' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white m-0">CRM Lead Pipeline & Discovered Prospects</h2>
                    <p className="text-xs text-gray-400 m-0">Enriched decision makers, deliverability verification status, and outreach history.</p>
                  </div>
                  <span className="text-xs font-mono text-gray-400 bg-gray-900 border border-gray-800 px-3 py-1 rounded-md">
                    Total Prospects: {prospects.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto border border-gray-800 rounded-lg bg-gray-950">
                  {loading ? (
                    <div className="p-8 text-center text-gray-500 text-xs flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined animate-spin">sync</span> Loading prospects...
                    </div>
                  ) : prospects.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 text-xs">
                      <span className="material-symbols-outlined text-[36px] text-gray-600 block mb-2">inbox</span>
                      No prospect records found. Click <strong>"Run SDR Lead Campaign"</strong> to discover target leads.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-gray-800 bg-gray-900/80 text-gray-400 font-mono text-[11px]">
                          <th className="p-3">Target Company</th>
                          <th className="p-3">Decision Maker</th>
                          <th className="p-3">Verified Email</th>
                          <th className="p-3">Deliverability</th>
                          <th className="p-3">ICP Fit Score</th>
                          <th className="p-3">Deal Stage</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prospects.map((p, idx) => (
                          <tr key={idx} className="border-b border-gray-800/60 hover:bg-gray-900/50 transition-colors">
                            <td className="p-3">
                              <div className="font-semibold text-gray-200">{p.company_name}</div>
                              <div className="text-[10px] font-mono text-indigo-400">{p.domain}</div>
                            </td>
                            <td className="p-3">
                              <div className="text-gray-300">{p.contact_name || 'Executive'}</div>
                              <div className="text-[10px] text-gray-500">{p.contact_title || 'Decision Maker'}</div>
                            </td>
                            <td className="p-3 font-mono text-gray-300">
                              {p.contact_email || 'n/a'}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                                p.deliverability_status === 'VALID' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' :
                                p.deliverability_status === 'CATCH_ALL' ? 'bg-amber-950/80 text-amber-400 border border-amber-800' :
                                'bg-rose-950/80 text-rose-400 border border-rose-800'
                              }`}>
                                {p.deliverability_status || 'VALID'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-12 bg-gray-800 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="bg-indigo-500 h-full rounded-full"
                                    style={{ width: `${Math.min(p.icp_score || 90, 100)}%` }}
                                  ></div>
                                </div>
                                <span className="font-mono text-xs text-indigo-300 font-bold">{p.icp_score || 90}/100</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                p.deal_stage === 'OUTREACH_SENT' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                                p.deal_stage === 'CLOSED_WON' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                                'bg-gray-800 text-gray-300'
                              }`}>
                                {p.deal_stage || 'QUALIFIED'}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => setSelectedProspect(p)}
                                className="px-2.5 py-1 bg-indigo-900/40 hover:bg-indigo-900/70 text-indigo-300 border border-indigo-800/60 rounded text-[11px] font-medium transition-colors"
                              >
                                Inspect Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: ICP Strategy Setup */}
            {activeTab === 'icp' && (
              <div className="flex-1 flex flex-col overflow-y-auto">
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-white m-0">ICP & Business Strategy Configuration</h2>
                  <p className="text-xs text-gray-400 m-0">Define Ideal Customer Profile criteria, battlecards, competitor differentiators, and playbooks.</p>
                </div>

                <form onSubmit={handleSaveIcpConfig} className="flex flex-col gap-4 max-w-2xl">
                  <div>
                    <label className="text-xs text-gray-300 font-semibold block mb-1">Target Industries (Comma-separated)</label>
                    <input
                      type="text"
                      value={Array.isArray(icpConfig.target_industries) ? icpConfig.target_industries.join(', ') : icpConfig.target_industries}
                      onChange={(e) => setIcpConfig({ ...icpConfig, target_industries: e.target.value.split(',').map(s => s.trim()) })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-100 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-300 font-semibold block mb-1">Target Role Titles (Comma-separated)</label>
                    <input
                      type="text"
                      value={Array.isArray(icpConfig.target_titles) ? icpConfig.target_titles.join(', ') : icpConfig.target_titles}
                      onChange={(e) => setIcpConfig({ ...icpConfig, target_titles: e.target.value.split(',').map(s => s.trim()) })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-100 font-mono"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-300 font-semibold block mb-1">Min Headcount</label>
                      <input
                        type="number"
                        value={icpConfig.company_size_min}
                        onChange={(e) => setIcpConfig({ ...icpConfig, company_size_min: parseInt(e.target.value) || 10 })}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-300 font-semibold block mb-1">Max Headcount</label>
                      <input
                        type="number"
                        value={icpConfig.company_size_max}
                        onChange={(e) => setIcpConfig({ ...icpConfig, company_size_max: parseInt(e.target.value) || 1000 })}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-300 font-semibold block mb-1">Competitor Battlecard & Key Differentiators</label>
                    <textarea
                      rows={3}
                      value={icpConfig.battlecard_notes || ''}
                      onChange={(e) => setIcpConfig({ ...icpConfig, battlecard_notes: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-300 font-semibold block mb-1">Sales Playbook Strategy</label>
                    <textarea
                      rows={3}
                      value={icpConfig.playbook_strategy || ''}
                      onChange={(e) => setIcpConfig({ ...icpConfig, playbook_strategy: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-100"
                    />
                  </div>

                  <button
                    type="submit"
                    className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg transition-colors w-fit"
                  >
                    Save ICP Configuration
                  </button>
                </form>
              </div>
            )}

            {/* TAB 3: Audit Trail Logs */}
            {activeTab === 'logs' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-white m-0">Live Pipeline Execution Audit Trail</h2>
                  <p className="text-xs text-gray-400 m-0">Step-by-step logs for active SDR runs.</p>
                </div>

                <div className="flex-1 bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-xs overflow-y-auto space-y-2">
                  {logs.length === 0 ? (
                    <div className="text-gray-500 italic">No execution logs captured yet. Run a pipeline to view real-time steps.</div>
                  ) : (
                    logs.map((l, idx) => (
                      <div key={idx} className="p-2.5 bg-gray-900/60 rounded border border-gray-800/80">
                        <div className="flex items-center justify-between text-indigo-300 font-bold mb-1">
                          <span>{l.stage}</span>
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">{l.status}</span>
                        </div>
                        <div className="text-gray-300 text-[11px]">{l.details}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Apollo Key Configuration Modal */}
        {apolloKeyModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400">key</span> Configure Apollo Master API Key
                </h3>
                <button onClick={() => setApolloKeyModalOpen(false)} className="text-gray-400 hover:text-white font-bold">✕</button>
              </div>

              <p className="text-xs text-gray-400 mb-4">
                Enter your Apollo Master API key to enable direct account sourcing and role-based contact discovery.
              </p>

              <form onSubmit={handleSaveApolloKey} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-gray-300 font-semibold block mb-1">Apollo Master API Key</label>
                  <input
                    type="password"
                    placeholder="apollo_api_key_..."
                    value={apolloKeyInput}
                    onChange={(e) => setApolloKeyInput(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-100 font-mono"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setApolloKeyModalOpen(false)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                  >
                    Save & Validate Key
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Selected Prospect Detail Inspection Modal */}
        {selectedProspect && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 max-w-lg w-full shadow-2xl overflow-y-auto max-h-[85vh]">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white m-0">{selectedProspect.company_name}</h3>
                  <span className="text-xs font-mono text-indigo-400">{selectedProspect.domain}</span>
                </div>
                <button onClick={() => setSelectedProspect(null)} className="text-gray-400 hover:text-white font-bold">✕</button>
              </div>

              <div className="space-y-4 text-xs">
                <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 space-y-1">
                  <div className="font-semibold text-gray-300">Decision Maker: <span className="text-gray-100">{selectedProspect.contact_name}</span></div>
                  <div className="text-gray-400">Title: {selectedProspect.contact_title}</div>
                  <div className="font-mono text-indigo-300">Email: {selectedProspect.contact_email}</div>
                  <div className="text-emerald-400 font-mono text-[11px]">Deliverability: {selectedProspect.deliverability_status}</div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-300 mb-1">Generated Outreach Subject</h4>
                  <div className="bg-gray-900 p-2.5 rounded border border-gray-800 text-gray-200 font-mono text-[11px]">
                    {selectedProspect.outreach_subject || 'Autonomous Workflow Automation Proposal'}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-300 mb-1">Generated Outreach Email Body</h4>
                  <div className="bg-gray-900 p-3 rounded border border-gray-800 text-gray-300 whitespace-pre-wrap font-sans leading-relaxed text-[11px]">
                    {selectedProspect.outreach_body || 'Outreach email body generated by OpenRouter LLM.'}
                  </div>
                </div>

                {selectedProspect.scraped_context && (
                  <div>
                    <h4 className="font-semibold text-gray-300 mb-1">Crawl4AI Scraped Context</h4>
                    <div className="bg-gray-900 p-3 rounded border border-gray-800 text-gray-400 text-[10px] max-h-32 overflow-y-auto font-mono">
                      {selectedProspect.scraped_context}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setSelectedProspect(null)}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
