'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import { getAuthHeader } from '@/lib/api';

export default function SalesDashboard() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buildingIcp, setBuildingIcp] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('prospects'); // 'prospects' | 'replies' | 'proposals' | 'sales' | 'icp' | 'logs'
  const [message, setMessage] = useState('');

  // Analytics Metrics State
  const [analytics, setAnalytics] = useState({
    total_prospects: 0,
    contacted_count: 0,
    replied_count: 0,
    sales_completed_count: 0,
    total_revenue: 0.0,
    active_pipeline_value: 0.0,
    conversion_rate: 0.0,
    reply_rate: 0.0,
  });

  useEffect(() => {
    try {
      const cachedIcp = localStorage.getItem('sales_icp_config');
      if (cachedIcp) {
        const parsed = JSON.parse(cachedIcp);
        setIcpConfig(parsed);
        setIcpBuilt(true);
      }
    } catch (e) {}

    fetchData();
    fetchAnalytics();
    fetchIcpConfig();
  }, []);

  const formatList = (val, maxCount) => {
    if (!val) return '';
    let arr = [];
    if (Array.isArray(val)) {
      arr = val;
    } else if (typeof val === 'string') {
      arr = val.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (maxCount && arr.length > maxCount) {
      arr = arr.slice(0, maxCount);
    }
    return arr.join(', ');
  };

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
      const res = await fetch('/api/v1/sales/prospects', {
        headers: { ...getAuthHeader() },
      });
      const data = await safeJsonParse(res);
      setProspects(data.prospects || []);
    } catch (err) {
      console.error('Failed to fetch prospects:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/v1/sales/analytics', {
        headers: { ...getAuthHeader() },
      });
      const data = await safeJsonParse(res);
      if (data.success && data.analytics) {
        setAnalytics(data.analytics);
      }
    } catch (err) {
      console.error('Failed to fetch sales analytics:', err);
    }
  };

  const fetchIcpConfig = async () => {
    try {
      const res = await fetch('/api/v1/sales/icp', {
        headers: { ...getAuthHeader() },
      });
      const data = await safeJsonParse(res);
      if (data.success && data.icp) {
        setIcpConfig(data.icp);
        if (data.icp.target_industries && data.icp.target_industries.length > 0) setIcpBuilt(true);
      }
    } catch (err) {
      console.error('Failed to fetch ICP config:', err);
    }
  };

  const getCurrentAndPastProspects = () => {
    if (!prospects || prospects.length === 0) {
      return { currentProspects: latestRunProspects || [], pastProspects: [] };
    }
    if (latestRunProspects && latestRunProspects.length > 0) {
      const latestEmails = new Set(latestRunProspects.map((p) => (p.contact_email || p.email || '').toLowerCase().trim()));
      const past = prospects.filter((p) => !latestEmails.has((p.contact_email || p.email || '').toLowerCase().trim()));
      return { currentProspects: latestRunProspects, pastProspects: past };
    }
    const newestCreatedAt = prospects[0]?.created_at ? new Date(prospects[0].created_at).getTime() : 0;
    if (!newestCreatedAt) return { currentProspects: prospects, pastProspects: [] };
    const current = [];
    const past = [];
    const seenEmails = new Set();
    for (const p of prospects) {
      const email = (p.contact_email || p.email || '').toLowerCase().trim();
      const pTime = p.created_at ? new Date(p.created_at).getTime() : 0;
      if (Math.abs(newestCreatedAt - pTime) <= 60000 && !seenEmails.has(email)) {
        current.push(p);
        if (email) seenEmails.add(email);
      } else {
        past.push(p);
      }
    }
    return { currentProspects: current, pastProspects: past };
  };

  const { currentProspects, pastProspects } = getCurrentAndPastProspects();
  const displayedProspects = prospectSubTab === 'current' ? currentProspects : pastProspects;

  const handleBuildIcp = async () => {
    setBuildingIcp(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/sales/icp/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      const data = await safeJsonParse(res);
      if (data.success && data.icp) {
        setIcpConfig(data.icp);
        setIcpBuilt(true);
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

  const handleRunPipeline = async (e) => {
    e.preventDefault();
    setRunningPipeline(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/sales/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          prospect_limit: Math.max(1, parseInt(prospectLimit) || 1),
          auto_send_email: autoSendEmail,
          icp_config: icpConfig,
        }),
      });
      const data = await safeJsonParse(res);
      if (data.success && data.result) {
        const result = data.result;
        setLogs(result.logs || []);
        if ((result.processed_count || 0) > 0) {
          setMessage(`✅ SDR Campaign completed! Discovered & verified ${result.processed_count} deliverable prospects.`);
        } else {
          setMessage(`⚠️ Campaign completed. Detail: ${result.answer || 'No prospects passed deliverability.'}`);
        }
        const batch = (result.outreach_batch && result.outreach_batch.length > 0) ? result.outreach_batch : (result.prospects || []);
        setLatestRunProspects(batch);
        setProspectSubTab('current');
        fetchData();
        fetchAnalytics();
      } else {
        setMessage(`❌ Campaign execution failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`❌ Network error: ${err.message}`);
    } finally {
      setRunningPipeline(false);
    }
  };

  // Feature 1: Check Email Replies & Simulate Reply
  const handleCheckReplies = async (simulate = false, prospectId = null, simText = null) => {
    setCheckingReplies(true);
    try {
      const res = await fetch('/api/v1/sales/check-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          simulate_reply: simulate,
          prospect_id: prospectId,
          simulated_text: simText,
        }),
      });
      const data = await safeJsonParse(res);
      if (data.success) {
        setMessage(`✅ Checked inbox! Found ${data.replies_found} prospect reply/replies.`);
        fetchData();
        fetchAnalytics();
        if (simulate) setSimulateReplyModalOpen(false);
        setActiveTab('replies');
      } else {
        setMessage(`❌ Error checking replies: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`❌ Network error checking replies: ${err.message}`);
    } finally {
      setCheckingReplies(false);
    }
  };

  const handleSendAiReply = async (prospect) => {
    if (!prospect || !prospect.ai_reply_draft) return;
    setSendingEmail(true);
    try {
      const res = await fetch('/api/v1/sales/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          prospect_id: prospect.id,
          reply_text: prospect.ai_reply_draft,
        }),
      });
      const data = await safeJsonParse(res);
      if (data.success) {
        setMessage(`✅ AI Reply sent to ${prospect.contact_email}!`);
        fetchData();
        fetchAnalytics();
        setSelectedProspect(null);
      } else {
        alert(`❌ Reply dispatch failed: ${data.error}`);
      }
    } catch (err) {
      alert(`❌ Network error: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendSingleOutreachEmail = async (prospect) => {
    if (!prospect) return;
    const email = prospect.contact_email || prospect.email;
    const subject = prospect.outreach_subject || prospect.subject || 'Partnership Proposal';
    const body = prospect.outreach_body || prospect.body || '';

    setSendingEmail(true);
    try {
      const res = await fetch('/api/v1/sales/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          prospect_id: prospect.id || null,
          contact_email: email,
          subject: subject,
          body: body,
        }),
      });
      const data = await safeJsonParse(res);
      if (data.success) {
        setMessage(`✅ Outreach email successfully dispatched to ${email}!`);
        fetchData();
        fetchAnalytics();
        setSelectedProspect(null);
      } else {
        alert(`❌ Dispatch failed: ${data.error || data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`❌ Network error dispatching email: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSaveIcpConfig = async (e) => {
    if (e) e.preventDefault();
    setSavingIcp(true);
    try {
      const industriesArr = typeof icpConfig.target_industries === 'string'
        ? icpConfig.target_industries.split(',').map((s) => s.trim()).filter(Boolean)
        : icpConfig.target_industries;
      const titlesArr = typeof icpConfig.target_titles === 'string'
        ? icpConfig.target_titles.split(',').map((s) => s.trim()).filter(Boolean)
        : icpConfig.target_titles;

      const payload = {
        ...icpConfig,
        target_industries: industriesArr,
        target_titles: titlesArr,
      };

      const res = await fetch('/api/v1/sales/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      const data = await safeJsonParse(res);
      if (data.success) {
        setIcpConfig(payload);
        localStorage.setItem('sales_icp_config', JSON.stringify(payload));
        setMessage('✅ ICP Strategy configuration saved successfully.');
      } else {
        setMessage(`❌ Failed to save ICP Strategy: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`❌ Network error saving ICP Strategy: ${err.message}`);
    } finally {
      setSavingIcp(false);
    }
  };

  // Feature 2: Draft Proposal & Send Proposal (Human-in-the-Loop)
  const handleDraftProposal = async (prospect) => {
    if (!prospect) return;
    setDraftingProposal(true);
    try {
      const res = await fetch('/api/v1/sales/proposals/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          prospect_id: prospect.id,
          pricing_tier: 'Enterprise',
        }),
      });
      const data = await safeJsonParse(res);
      if (data.success && data.proposal) {
        setMessage(`✅ Proposal drafted for ${prospect.company_name}! Paused for human review.`);
        fetchData();
        fetchAnalytics();
        setProposalModalProspect({ ...prospect, proposal_details: data.proposal, proposal_status: 'DRAFTED' });
        setActiveTab('proposals');
      } else {
        alert(`❌ Drafting proposal failed: ${data.error}`);
      }
    } catch (err) {
      alert(`❌ Network error: ${err.message}`);
    } finally {
      setDraftingProposal(false);
    }
  };

  const handleSendProposal = async (prospect) => {
    if (!prospect) return;
    setSendingProposal(true);
    try {
      const res = await fetch('/api/v1/sales/proposals/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ prospect_id: prospect.id }),
      });
      const data = await safeJsonParse(res);
      if (data.success) {
        setMessage(`✅ Human approved! Proposal sent to ${prospect.contact_email}.`);
        fetchData();
        fetchAnalytics();
        setProposalModalProspect(null);
      } else {
        alert(`❌ Sending proposal failed: ${data.error}`);
      }
    } catch (err) {
      alert(`❌ Network error: ${err.message}`);
    } finally {
      setSendingProposal(false);
    }
  };

  // Feature 4: Confirm Sale & Notify Finance Agent
  const handleConfirmSale = async (prospect) => {
    if (!prospect) return;
    setConfirmingSale(true);
    try {
      const res = await fetch('/api/v1/sales/deal/confirm-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          prospect_id: prospect.id,
          final_deal_value: parseFloat(finalDealValueInput) || 50000,
        }),
      });
      const data = await safeJsonParse(res);
      if (data.success) {
        setMessage(`🏆 Sale closed for ${prospect.company_name}! Sales Report created and Finance Agent notified.`);
        fetchData();
        fetchAnalytics();
        setConfirmSaleModalProspect(null);
        setReportModalDetails(data.sales_report);
        setActiveTab('sales');
      } else {
        alert(`❌ Sale confirmation failed: ${data.error}`);
      }
    } catch (err) {
      alert(`❌ Network error: ${err.message}`);
    } finally {
      setConfirmingSale(false);
    }
  };

  const hasValidJsonData = (val) => {
    if (!val) return false;
    if (typeof val === 'string') {
      if (val === '{}' || val === '[]' || val.trim() === '') return false;
      try {
        const parsed = JSON.parse(val);
        return parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
      } catch (e) {
        return false;
      }
    }
    if (typeof val === 'object') {
      return Object.keys(val).length > 0;
    }
    return false;
  };

  const repliesProspects = prospects.filter((p) => 
    p.has_reply === true || 
    (p.reply_content && p.reply_content.trim() !== '') || 
    p.deal_stage === 'REPLIED' || 
    p.deal_stage === 'PROPOSAL_REQUESTED'
  );
  const proposalsProspects = prospects.filter((p) => 
    (p.proposal_status && p.proposal_status !== 'NONE') || 
    p.deal_stage === 'PROPOSAL_DRAFTED' || 
    p.deal_stage === 'PROPOSAL_SENT' || 
    hasValidJsonData(p.proposal_details)
  );
  const closedSalesProspects = prospects.filter((p) => 
    p.deal_stage === 'CLOSED_WON' || 
    hasValidJsonData(p.sales_report)
  );

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
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shadow">
                <span className="material-symbols-outlined text-primary text-[22px]">person_search</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">Sales Agent</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Autonomous Sourcing, Reply Handling, Proposals & Finance Integration</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleCheckReplies(false)}
              disabled={checkingReplies}
              className="px-md py-sm bg-surface-variant hover:bg-outline-variant text-primary border border-outline-variant rounded-md text-body-sm font-label-md transition-all flex items-center gap-2"
            >
              <span className={`material-symbols-outlined text-[18px] ${checkingReplies ? 'animate-spin' : ''}`}>sync</span>
              Check Email Replies
            </button>

            <button
              onClick={() => setSimulateReplyModalOpen(true)}
              className="px-md py-sm bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/30 rounded-md text-body-sm font-label-md transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">mark_email_unread</span>
              Simulate Prospect Reply
            </button>

            <button
              onClick={() => { fetchData(); fetchAnalytics(); }}
              className="px-md py-sm bg-surface-variant hover:bg-outline-variant rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh
            </button>
          </div>
        </header>

        {/* Feature 3: Dashboard Analytics Stats Bar */}
        <section className="bg-surface/80 border-b border-outline-variant/60 px-lg py-md flex-shrink-0 grid grid-cols-4 gap-md">
          <div className="bg-background border border-outline-variant rounded-lg p-sm flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-on-surface-variant font-label-md block uppercase tracking-wider">Prospects Contacted</span>
              <span className="text-2xl font-bold text-on-surface">{analytics.contacted_count}</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-900/30 text-blue-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">send</span>
            </div>
          </div>

          <div className="bg-background border border-outline-variant rounded-lg p-sm flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-on-surface-variant font-label-md block uppercase tracking-wider">Replies Received</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-on-surface">{analytics.replied_count}</span>
                <span className="text-xs text-green-400 font-bold">({analytics.reply_rate}% rate)</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-900/30 text-purple-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">forum</span>
            </div>
          </div>

          <div className="bg-background border border-outline-variant rounded-lg p-sm flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-on-surface-variant font-label-md block uppercase tracking-wider">Sales Completed</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-400">{analytics.sales_completed_count}</span>
                <span className="text-xs text-emerald-300 font-bold">({analytics.conversion_rate}% Conv)</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-900/30 text-emerald-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">verified</span>
            </div>
          </div>

          <div className="bg-background border border-outline-variant rounded-lg p-sm flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-on-surface-variant font-label-md block uppercase tracking-wider">Revenue / Pipeline</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-primary">${analytics.total_revenue.toLocaleString()}</span>
                <span className="text-xs text-on-surface-variant">(${analytics.active_pipeline_value.toLocaleString()} pipe)</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-900/30 text-amber-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">payments</span>
            </div>
          </div>
        </section>

        {/* Main Content Body */}
        <main className="flex-1 flex overflow-hidden p-lg gap-lg">
          {/* Left Form / Workflow Controls Panel */}
          <div className="w-1/3 bg-surface border border-outline-variant rounded-lg p-md flex flex-col gap-md overflow-y-auto">
            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">psychology</span> Step 1: Knowledge Base ICP
            </h2>

            {message && (
              <div className="p-sm bg-surface-variant border border-outline-variant rounded-md text-body-sm text-primary">
                {message}
              </div>
            )}

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

            <div className="p-sm bg-background border border-outline-variant rounded-md flex flex-col gap-xs text-body-sm">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-on-surface">Target ICP:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${icpBuilt ? 'bg-green-900/40 text-green-300' : 'bg-surface-variant text-on-surface-variant'}`}>
                  {icpBuilt ? 'ICP Ready' : 'Pending Build'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Industries:</span>
                <span className="font-bold text-right">{formatList(icpConfig?.target_industries, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Roles:</span>
                <span className="font-bold text-right">{formatList(icpConfig?.target_titles, 2)}</span>
              </div>
            </div>

            <hr className="border-outline-variant my-xs" />

            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">tune</span> Step 2: Campaign Settings
            </h2>

            <form onSubmit={handleRunPipeline} className="flex flex-col gap-md">
              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Profiles Stop Limit (Target Prospects)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={prospectLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setProspectLimit(isNaN(val) ? '' : Math.max(1, val));
                  }}
                  onBlur={() => {
                    if (!prospectLimit || prospectLimit < 1) setProspectLimit(1);
                  }}
                  placeholder="Enter target prospect count (e.g. 10)"
                  className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-between p-sm bg-background border border-outline-variant rounded-md">
                <div>
                  <span className="text-body-sm font-label-md text-on-surface block font-bold">Auto-Send Emails</span>
                  <span className="text-xs text-on-surface-variant">Dispatch initial outreach automatically</span>
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
                className="py-md bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded-md transition-colors flex items-center justify-center gap-2 shadow"
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

          {/* Right Data Views Panel with Tabbed System */}
          <div className="flex-1 bg-surface border border-outline-variant rounded-lg p-md flex flex-col overflow-hidden">
            {/* Tabs Header */}
            <div className="flex border-b border-outline-variant mb-md gap-sm overflow-x-auto">
              <button
                onClick={() => setActiveTab('prospects')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'prospects' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">groups</span> Prospects ({prospects.length})
              </button>

              <button
                onClick={() => setActiveTab('replies')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'replies' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">forum</span> Email Replies ({repliesProspects.length})
              </button>

              <button
                onClick={() => setActiveTab('proposals')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'proposals' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">description</span> Proposals ({proposalsProspects.length})
              </button>

              <button
                onClick={() => setActiveTab('sales')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'sales' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">verified_user</span> Sales & Finance ({closedSalesProspects.length})
              </button>

              <button
                onClick={() => setActiveTab('icp')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'icp' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">tune</span> ICP Strategy
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'logs' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span> Audit Logs ({logs.length})
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto">
              {/* TAB 1: Prospects Matrix */}
              {activeTab === 'prospects' && (
                <div className="flex flex-col gap-sm">
                  <div className="flex items-center justify-between pb-sm border-b border-outline-variant/60">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setProspectSubTab('current')}
                        className={`px-3 py-1.5 text-xs font-label-md rounded-md transition-all flex items-center gap-1.5 ${
                          prospectSubTab === 'current' ? 'bg-primary text-on-primary font-bold shadow' : 'bg-surface-variant/70 text-on-surface-variant'
                        }`}
                      >
                        Current Run ({currentProspects.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setProspectSubTab('past')}
                        className={`px-3 py-1.5 text-xs font-label-md rounded-md transition-all flex items-center gap-1.5 ${
                          prospectSubTab === 'past' ? 'bg-primary text-on-primary font-bold shadow' : 'bg-surface-variant/70 text-on-surface-variant'
                        }`}
                      >
                        Past Runs ({pastProspects.length})
                      </button>
                    </div>
                  </div>

                  {loading ? (
                    <p className="text-on-surface-variant font-body-sm italic p-md text-center">Loading prospects...</p>
                  ) : displayedProspects.length === 0 ? (
                    <div className="p-xl text-center flex flex-col items-center justify-center gap-xs">
                      <span className="material-symbols-outlined text-outline text-[36px]">inbox</span>
                      <p className="text-on-surface-variant font-body-sm italic m-0">No prospect records found in this view.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-body-sm">
                      <thead>
                        <tr className="border-b border-outline-variant text-on-surface-variant font-label-md">
                          <th className="p-sm">Company</th>
                          <th className="p-sm">Contact</th>
                          <th className="p-sm">Email</th>
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
                                p.deal_stage === 'CLOSED_WON' ? 'bg-emerald-900/50 text-emerald-300' :
                                p.deal_stage === 'PROPOSAL_SENT' ? 'bg-blue-900/40 text-blue-300' :
                                p.deal_stage === 'PROPOSAL_DRAFTED' ? 'bg-amber-900/40 text-amber-300' :
                                p.deal_stage === 'REPLIED' ? 'bg-purple-900/40 text-purple-300' :
                                'bg-surface-variant text-on-surface-variant'
                              }`}>
                                {p.deal_stage || 'DISCOVERED'}
                              </span>
                            </td>
                            <td className="p-sm text-right flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedProspect(p)}
                                className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-md text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[15px]">visibility</span> View Draft Email
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* TAB 2: Email Replies & AI Counter-Responses */}
              {activeTab === 'replies' && (
                <div className="flex flex-col gap-md">
                  <div className="flex justify-between items-center bg-purple-950/20 border border-purple-800/30 p-sm rounded-md">
                    <span className="text-xs text-purple-200">
                      Feature 1: Autonomous Reply Checker & AI Response Generator
                    </span>
                    <button
                      onClick={() => handleCheckReplies(false)}
                      disabled={checkingReplies}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded"
                    >
                      {checkingReplies ? 'Scanning...' : 'Scan Active Replies'}
                    </button>
                  </div>

                  {repliesProspects.length === 0 ? (
                    <div className="p-xl text-center text-on-surface-variant italic">
                      No prospect replies recorded yet. Use "Check Email Replies" or click "Simulate Prospect Reply" to test!
                    </div>
                  ) : (
                    <div className="flex flex-col gap-md">
                      {repliesProspects.map((p, idx) => (
                        <div key={idx} className="bg-background border border-outline-variant rounded-lg p-md flex flex-col gap-sm shadow-sm">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-bold text-on-surface text-base">{p.company_name}</span>
                              <span className="text-xs text-on-surface-variant ml-2 font-mono">{p.contact_email}</span>
                            </div>
                            <span className="px-2.5 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs font-bold">
                              {p.reply_status || 'REPLY_RECEIVED'}
                            </span>
                          </div>

                          <div className="p-sm bg-surface/80 border border-outline-variant/60 rounded text-xs">
                            <span className="font-bold block text-purple-300 mb-1">Inbound Prospect Reply:</span>
                            <p className="m-0 italic text-on-surface">{p.reply_content || 'Requested information regarding pricing and agreement.'}</p>
                          </div>

                          <div className="p-sm bg-primary/10 border border-primary/20 rounded text-xs">
                            <span className="font-bold block text-primary mb-1">Generated AI Sales Reply Draft:</span>
                            <p className="m-0 font-mono text-on-surface whitespace-pre-line">{p.ai_reply_draft || 'Hi! Thank you for reaching out. We would be glad to arrange a walkthrough.'}</p>
                          </div>

                          <div className="flex justify-end gap-sm mt-xs">
                            <button
                              onClick={() => handleDraftProposal(p)}
                              className="px-md py-sm bg-secondary text-on-secondary font-label-md rounded text-xs"
                            >
                              Draft Formal Proposal
                            </button>
                            <button
                              onClick={() => handleSendAiReply(p)}
                              className="px-md py-sm bg-primary text-on-primary font-label-md rounded text-xs flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[15px]">send</span> Send AI Reply
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Proposals & Agreements (Human-in-the-Loop) */}
              {activeTab === 'proposals' && (
                <div className="flex flex-col gap-md">
                  <div className="bg-amber-950/20 border border-amber-800/30 p-sm rounded-md text-xs text-amber-200">
                    ⚠️ <strong>Human-in-the-Loop Safeguard</strong>: Proposal drafting stops automatically. Human review is required before clicking "Send Proposal".
                  </div>

                  {proposalsProspects.length === 0 ? (
                    <div className="p-xl text-center text-on-surface-variant italic">
                      No proposals drafted yet. Click "Draft Proposal" next to any prospect to generate a formal agreement.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-md">
                      {proposalsProspects.map((p, idx) => {
                        const proposal = typeof p.proposal_details === 'string' ? JSON.parse(p.proposal_details || '{}') : (p.proposal_details || {});
                        return (
                          <div key={idx} className="bg-background border border-outline-variant rounded-lg p-md flex flex-col gap-sm shadow">
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="font-bold text-on-surface m-0 text-base">{proposal.title || `Proposal for ${p.company_name}`}</h4>
                                <span className="text-xs text-on-surface-variant">{p.company_name} — {p.contact_email}</span>
                              </div>
                              <span className={`px-3 py-1 rounded text-xs font-bold ${
                                p.proposal_status === 'SENT' ? 'bg-blue-900/50 text-blue-300' : 'bg-amber-900/50 text-amber-300 animate-pulse'
                              }`}>
                                {p.proposal_status === 'SENT' ? 'Proposal Sent' : 'Awaiting Human Approval'}
                              </span>
                            </div>

                            <div className="p-sm bg-surface border border-outline-variant/60 rounded text-xs flex justify-between items-center">
                              <div>
                                <span>Pricing Tier: <strong className="text-primary">{proposal.pricing_tier || 'Enterprise'}</strong></span>
                                <span className="ml-4">Annual Value: <strong className="text-emerald-400">${(proposal.deal_value || p.deal_value || 50000).toLocaleString()}</strong></span>
                              </div>
                              <span>Payment Terms: <strong>{proposal.payment_terms || 'Net 30 Days'}</strong></span>
                            </div>

                            <div className="p-sm bg-surface border border-outline-variant/60 rounded text-xs font-mono">
                              <span className="font-bold block text-on-surface mb-1 font-sans">Deliverables & Scope:</span>
                              <ul className="list-disc pl-4 m-0 space-y-0.5">
                                {(proposal.deliverables || ['Enterprise AI Workflow Engine', 'SLA Support']).map((d, i) => (
                                  <li key={i}>{d}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="flex justify-end gap-sm mt-xs">
                              <button
                                onClick={() => setProposalModalProspect(p)}
                                className="px-md py-sm bg-surface-variant text-on-surface font-label-md rounded text-xs"
                              >
                                Full Contract Preview
                              </button>

                              {p.proposal_status !== 'SENT' && (
                                <button
                                  onClick={() => handleSendProposal(p)}
                                  disabled={sendingProposal}
                                  className="px-md py-sm bg-emerald-600 hover:bg-emerald-500 text-white font-label-md rounded text-xs flex items-center gap-1.5 shadow"
                                >
                                  <span className="material-symbols-outlined text-[16px]">send</span> Approve & Send Proposal
                                </button>
                              )}

                              <button
                                onClick={() => { setConfirmSaleModalProspect(p); setFinalDealValueInput(proposal.deal_value || p.deal_value || 50000); }}
                                className="px-md py-sm bg-primary text-on-primary font-label-md rounded text-xs font-bold"
                              >
                                Confirm Sale
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: Closed Sales & Finance Integration */}
              {activeTab === 'sales' && (
                <div className="flex flex-col gap-md">
                  <div className="bg-emerald-950/20 border border-emerald-800/30 p-sm rounded-md text-xs text-emerald-200">
                    Feature 4: Completed Deals, Sales Reports & Inter-Agent Finance General Ledger Notification
                  </div>

                  {closedSalesProspects.length === 0 ? (
                    <div className="p-xl text-center text-on-surface-variant italic">
                      No closed sales yet. Click "Close Sale" next to any qualified prospect or agreement to finalize revenue!
                    </div>
                  ) : (
                    <div className="flex flex-col gap-md">
                      {closedSalesProspects.map((p, idx) => {
                        const report = typeof p.sales_report === 'string' ? JSON.parse(p.sales_report || '{}') : (p.sales_report || {});
                        return (
                          <div key={idx} className="bg-background border border-emerald-800/40 rounded-lg p-md flex flex-col gap-sm shadow">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-bold text-emerald-400 text-lg">{p.company_name}</span>
                                <span className="text-xs text-on-surface-variant ml-2">Contact: {p.contact_name} ({p.contact_email})</span>
                              </div>
                              <span className="px-3 py-1 bg-emerald-900/60 text-emerald-200 rounded font-bold text-sm">
                                ${ (p.deal_value || 50000).toLocaleString() } CLOSED
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-sm text-xs p-sm bg-surface rounded border border-outline-variant/60">
                              <div>
                                <span className="text-on-surface-variant block">Sales Report ID:</span>
                                <span className="font-mono text-primary font-bold">{report.report_id || 'REP-SALE-101'}</span>
                              </div>
                              <div>
                                <span className="text-on-surface-variant block">Finance Agent Sync:</span>
                                <span className="text-emerald-400 font-bold flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px]">check_circle</span> GL Ledger & Invoice Created
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-end gap-sm mt-xs">
                              <button
                                onClick={() => setReportModalDetails(report)}
                                className="px-md py-sm bg-emerald-800/40 text-emerald-200 hover:bg-emerald-800/60 font-label-md rounded text-xs flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[15px]">description</span> View Sales Report
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: Editable ICP Strategy */}
              {activeTab === 'icp' && (
                <form onSubmit={handleSaveIcpConfig} className="flex flex-col gap-md max-w-xl">
                  <div className="flex justify-between items-center bg-surface-variant/40 p-sm border border-outline-variant/60 rounded-md">
                    <span className="text-body-sm font-bold text-on-surface">Configure ICP & Campaign Playbook</span>
                    <button
                      type="submit"
                      disabled={savingIcp}
                      className="px-md py-sm bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded text-xs flex items-center gap-1.5 shadow"
                    >
                      <span className={`material-symbols-outlined text-[16px] ${savingIcp ? 'animate-spin' : ''}`}>{savingIcp ? 'sync' : 'save'}</span>
                      {savingIcp ? 'Saving...' : 'Save ICP Strategy'}
                    </button>
                  </div>

                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">
                      Target Industries (Comma-Separated)
                    </label>
                    <input
                      type="text"
                      value={typeof icpConfig?.target_industries === 'string' ? icpConfig.target_industries : formatList(icpConfig?.target_industries)}
                      onChange={(e) => setIcpConfig({ ...icpConfig, target_industries: e.target.value })}
                      placeholder="e.g. Software, SaaS, Fintech, HealthTech"
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">
                      Target Executive Titles (Comma-Separated)
                    </label>
                    <input
                      type="text"
                      value={typeof icpConfig?.target_titles === 'string' ? icpConfig.target_titles : formatList(icpConfig?.target_titles)}
                      onChange={(e) => setIcpConfig({ ...icpConfig, target_titles: e.target.value })}
                      placeholder="e.g. VP of Sales, CTO, Head of Growth"
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-md">
                    <div>
                      <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Company Size Min Headcount</label>
                      <input
                        type="number"
                        value={icpConfig.company_size_min || 10}
                        onChange={(e) => setIcpConfig({ ...icpConfig, company_size_min: parseInt(e.target.value) || 1 })}
                        className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Company Size Max Headcount</label>
                      <input
                        type="number"
                        value={icpConfig.company_size_max || 1000}
                        onChange={(e) => setIcpConfig({ ...icpConfig, company_size_max: parseInt(e.target.value) || 100 })}
                        className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">
                      Target Region / Geography
                    </label>
                    <input
                      type="text"
                      value={icpConfig?.region || ''}
                      onChange={(e) => setIcpConfig({ ...icpConfig, region: e.target.value })}
                      placeholder="e.g. United States, Europe, APAC (leave empty for global)"
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">
                      Battlecard & Product Differentiators
                    </label>
                    <textarea
                      rows={3}
                      value={icpConfig.battlecard_notes || ''}
                      onChange={(e) => setIcpConfig({ ...icpConfig, battlecard_notes: e.target.value })}
                      placeholder="Enter key product value propositions and pain points solved..."
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">
                      Playbook Strategy & Messaging Pitch
                    </label>
                    <textarea
                      rows={3}
                      value={icpConfig.playbook_strategy || ''}
                      onChange={(e) => setIcpConfig({ ...icpConfig, playbook_strategy: e.target.value })}
                      placeholder="Enter strategic messaging hooks for target buyers..."
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end pt-xs">
                    <button
                      type="submit"
                      disabled={savingIcp}
                      className="px-lg py-sm bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded text-sm flex items-center gap-1.5 shadow"
                    >
                      <span className={`material-symbols-outlined text-[18px] ${savingIcp ? 'animate-spin' : ''}`}>{savingIcp ? 'sync' : 'save'}</span>
                      {savingIcp ? 'Saving Strategy...' : 'Save ICP Strategy'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 6: Execution Audit Logs */}
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

        {/* Modal: Simulate Prospect Reply */}
        {simulateReplyModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-outline-variant rounded-lg p-lg max-w-md w-full shadow-lg">
              <div className="flex justify-between items-center mb-md">
                <h3 className="font-title-md text-on-surface m-0">Simulate Inbound Prospect Reply</h3>
                <button onClick={() => setSimulateReplyModalOpen(false)} className="text-on-surface-variant font-bold">✕</button>
              </div>

              <div className="flex flex-col gap-md">
                <div>
                  <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Select Target Prospect</label>
                  <select
                    value={simulateTargetProspectId}
                    onChange={(e) => setSimulateTargetProspectId(e.target.value)}
                    className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  >
                    <option value="">-- Any / Recent Prospect --</option>
                    {prospects.map((p) => (
                      <option key={p.id} value={p.id}>{p.company_name} ({p.contact_email})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">Inbound Reply Content</label>
                  <textarea
                    rows={4}
                    placeholder="Enter simulated prospect email body (e.g. 'We are very interested in reviewing your enterprise proposal and pricing structure...')"
                    value={simulatedReplyText}
                    onChange={(e) => setSimulatedReplyText(e.target.value)}
                    className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  />
                </div>

                <div className="flex justify-end gap-sm">
                  <button
                    onClick={() => setSimulateReplyModalOpen(false)}
                    className="px-md py-sm bg-surface-variant text-on-surface rounded-md text-body-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleCheckReplies(true, simulateTargetProspectId || null, simulatedReplyText || null)}
                    className="px-md py-sm bg-primary text-on-primary rounded-md text-body-sm font-label-md"
                  >
                    Simulate Reply & Generate Response
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Confirm Sale */}
        {confirmSaleModalProspect && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-outline-variant rounded-lg p-lg max-w-md w-full shadow-lg">
              <div className="flex justify-between items-center mb-md">
                <h3 className="font-title-md text-on-surface m-0">Confirm Sale for {confirmSaleModalProspect.company_name}</h3>
                <button onClick={() => setConfirmSaleModalProspect(null)} className="text-on-surface-variant font-bold">✕</button>
              </div>

              <div className="flex flex-col gap-md text-body-sm">
                <div>
                  <label className="font-bold block mb-1">Final Deal Annual Value ($)</label>
                  <input
                    type="number"
                    value={finalDealValueInput}
                    onChange={(e) => setFinalDealValueInput(e.target.value)}
                    className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-mono"
                  />
                </div>

                <p className="text-xs text-on-surface-variant">
                  Confirming this sale will update the deal stage to CLOSED_WON, generate the Sales Completion Report, and automatically post revenue into the Finance Agent's General Ledger and Invoice ledger.
                </p>

                <div className="flex justify-end gap-sm mt-sm">
                  <button
                    onClick={() => setConfirmSaleModalProspect(null)}
                    className="px-md py-sm bg-surface-variant text-on-surface rounded-md text-body-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleConfirmSale(confirmSaleModalProspect)}
                    disabled={confirmingSale}
                    className="px-md py-sm bg-emerald-600 hover:bg-emerald-500 text-white font-label-md rounded text-body-sm"
                  >
                    {confirmingSale ? 'Notifying Finance...' : 'Confirm Sale & Notify Finance'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Sales Completion Report */}
        {reportModalDetails && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-outline-variant rounded-lg p-lg max-w-lg w-full shadow-lg overflow-y-auto max-h-[85vh]">
              <div className="flex justify-between items-center mb-md">
                <h3 className="font-title-md text-on-surface m-0">Sales Completion Report</h3>
                <button onClick={() => setReportModalDetails(null)} className="text-on-surface-variant font-bold">✕</button>
              </div>

              <div className="flex flex-col gap-md text-body-sm font-mono text-xs bg-background p-md border rounded">
                <div>Report ID: <span className="text-primary font-bold">{reportModalDetails.report_id}</span></div>
                <div>Client: <span className="text-on-surface font-bold">{reportModalDetails.company_name}</span></div>
                <div>Contact: {reportModalDetails.contact_name} ({reportModalDetails.contact_email})</div>
                <div>Deal Value: <span className="text-emerald-400 font-bold">${(reportModalDetails.final_deal_value || 0).toLocaleString()}</span></div>
                <div>Payment Terms: {reportModalDetails.payment_terms}</div>
                <div>Executive Summary: {reportModalDetails.executive_summary}</div>
              </div>

              <div className="mt-md flex justify-end">
                <button
                  onClick={() => setReportModalDetails(null)}
                  className="px-md py-sm bg-primary text-on-primary rounded text-body-sm font-label-md"
                >
                  Close Report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Hunter Key */}
        {hunterKeyModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-outline-variant rounded-lg p-lg max-w-md w-full shadow-lg">
              <div className="flex justify-between items-center mb-md">
                <h3 className="font-title-md text-on-surface m-0">Set Hunter.io API Key</h3>
                <button onClick={() => setHunterKeyModalOpen(false)} className="text-on-surface-variant font-bold">✕</button>
              </div>
              <form onSubmit={handleSaveHunterKey} className="flex flex-col gap-md">
                <input
                  type="password"
                  placeholder="Enter Hunter.io API Key..."
                  value={hunterKeyInput}
                  onChange={(e) => setHunterKeyInput(e.target.value)}
                  className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
                <div className="flex justify-end gap-sm">
                  <button type="button" onClick={() => setHunterKeyModalOpen(false)} className="px-md py-sm bg-surface-variant text-on-surface rounded-md">Cancel</button>
                  <button type="submit" className="px-md py-sm bg-primary text-on-primary rounded-md font-label-md">Save Key</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Prospect Details & Draft Email View */}
        {selectedProspect && (() => {
          const emailSubject = selectedProspect.outreach_subject || selectedProspect.subject || 'Autonomous Workflow Velocity & Partnership';
          const emailBody = selectedProspect.outreach_body || selectedProspect.body || `Hi ${selectedProspect.contact_name || 'Executive'},\n\nI noticed ${selectedProspect.company_name || 'your enterprise'}'s ongoing digital initiatives. Our autonomous platform can streamline your outreach and operations with zero vendor lock-in...\n\nWould you be open to a 15-minute call next week?\n\nBest regards,\nAccount Executive`;
          const isSent = selectedProspect.deal_stage === 'OUTREACH_SENT' || (selectedProspect.gmail_message_id && selectedProspect.gmail_message_id !== '');

          return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-surface border border-outline-variant rounded-lg p-lg max-w-xl w-full shadow-2xl overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-md border-b border-outline-variant pb-sm">
                  <div>
                    <h3 className="font-title-md text-on-surface m-0 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">business</span>
                      {selectedProspect.company_name}
                    </h3>
                    <span className="text-xs text-on-surface-variant font-mono">{selectedProspect.domain}</span>
                  </div>
                  <button onClick={() => setSelectedProspect(null)} className="text-on-surface-variant hover:text-on-surface font-bold text-lg">✕</button>
                </div>

                <div className="flex flex-col gap-md text-body-sm">
                  {/* Prospect Header Info */}
                  <div className="p-sm bg-background border border-outline-variant/60 rounded-md grid grid-cols-2 gap-xs text-xs">
                    <div>
                      <span className="text-on-surface-variant block">Decision Maker:</span>
                      <span className="font-bold text-on-surface">{selectedProspect.contact_name || 'Executive'}</span>
                      <span className="text-on-surface-variant block">{selectedProspect.contact_title || 'Decision Maker'}</span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block">Email Address:</span>
                      <span className="font-mono text-primary font-bold">{selectedProspect.contact_email}</span>
                      <div className="mt-1 flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isSent ? 'bg-blue-900/50 text-blue-300' : 'bg-surface-variant text-on-surface-variant'}`}>
                          {selectedProspect.deal_stage || 'DISCOVERED'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Subject Line Field */}
                  <div>
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Outreach Subject Line</label>
                    <input
                      type="text"
                      readOnly
                      value={emailSubject}
                      className="w-full p-sm bg-background border border-outline rounded-md text-on-surface font-semibold text-sm"
                    />
                  </div>

                  {/* Outreach Body Field */}
                  <div>
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Drafted Cold Email Body</label>
                    <div className="p-md bg-background border border-outline rounded-md text-body-sm font-mono text-on-surface whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto">
                      {emailBody}
                    </div>
                  </div>

                  {/* Modal Action Buttons */}
                  <div className="flex justify-between items-center mt-sm pt-sm border-t border-outline-variant/60">
                    <button
                      onClick={() => setSelectedProspect(null)}
                      className="px-md py-sm bg-surface-variant hover:bg-outline-variant text-on-surface rounded-md text-body-sm font-label-md transition-colors"
                    >
                      Close
                    </button>

                    {!isSent ? (
                      <button
                        onClick={() => handleSendSingleOutreachEmail(selectedProspect)}
                        disabled={sendingEmail}
                        className="px-lg py-sm bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded-md text-body-sm flex items-center gap-2 shadow-md transition-all"
                      >
                        <span className={`material-symbols-outlined text-[18px] ${sendingEmail ? 'animate-spin' : ''}`}>
                          {sendingEmail ? 'sync' : 'send'}
                        </span>
                        {sendingEmail ? 'Sending Email via Gmail...' : 'Send Outreach Email'}
                      </button>
                    ) : (
                      <span className="px-md py-sm bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 rounded-md text-xs font-bold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span> Outreach Email Already Sent
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </AuthGuard>
  );
}
