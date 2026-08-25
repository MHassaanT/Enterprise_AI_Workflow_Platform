'use client';

import { useState, useEffect } from 'react';

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [quickview, setQuickview] = useState(null);
  const [alerts, setAlerts] = useState([]);
  
  // NL Query State
  const [userQuery, setUserQuery] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);

  // Digest Modal State
  const [isDigestOpen, setIsDigestOpen] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestContent, setDigestContent] = useState('');

  const fetchQuickview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/analytics/quickview');
      const data = await res.json();
      if (data.success) {
        setQuickview(data.quickview);
      }
    } catch (err) {
      console.error('Failed to fetch quickview:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/v1/analytics/alerts');
      const data = await res.json();
      if (data.success) {
        setAlerts(data.alerts);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  };

  useEffect(() => {
    fetchQuickview();
    fetchAlerts();
  }, []);

  const handleQuerySubmit = async (queryText) => {
    const q = queryText || userQuery;
    if (!q.trim()) return;
    setUserQuery(q);
    setQueryLoading(true);

    try {
      const res = await fetch('/api/v1/analytics/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_query: q })
      });
      const data = await res.json();
      if (data.success) {
        setQueryResult(data.data);
      }
    } catch (err) {
      console.error('Query failed:', err);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleGenerateDigest = async () => {
    setIsDigestOpen(true);
    setDigestLoading(true);
    try {
      const res = await fetch('/api/v1/analytics/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: 'default' })
      });
      const data = await res.json();
      if (data.success) {
        setDigestContent(data.report.markdown);
      }
    } catch (err) {
      console.error('Digest generation failed:', err);
    } finally {
      setDigestLoading(false);
    }
  };

  return (
    <div className="p-lg md:p-xl overflow-y-auto space-y-xl max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-md border-b border-outline-variant pb-md">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary-container/20 text-primary border border-primary/30">
                <span className="material-symbols-outlined text-2xl">analytics</span>
              </div>
              <h1 className="font-headline-md text-headline-md font-extrabold text-on-surface">
                AI Analytics Agent
              </h1>
            </div>
            <p className="text-body-md text-on-surface-variant mt-1">
              Executive quick-view metrics across Employees, Finances, Projects, Sales, Procurement, and AI Health.
            </p>
          </div>

          <div className="flex items-center gap-sm">
            <button
              onClick={fetchQuickview}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-surface-container border border-outline-variant hover:bg-surface-container-high text-on-surface font-semibold text-label-md flex items-center gap-2 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">{loading ? 'sync' : 'refresh'}</span>
              Refresh Quick-View
            </button>
            <button
              onClick={handleGenerateDigest}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-label-md flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-sm">summarize</span>
              Executive Digest
            </button>
          </div>
        </div>

        {/* Conversational NL Query Bar */}
        <div className="p-lg rounded-2xl bg-surface-container border border-outline-variant space-y-md shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">psychology</span>
            <h2 className="font-title-md text-title-md font-bold text-on-surface">
              Ask AI Analytics Agent (Natural Language Data Interpreter)
            </h2>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleQuerySubmit();
            }}
            className="flex flex-col sm:flex-row gap-sm"
          >
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-3 text-on-surface-variant">search</span>
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="e.g. 'Show department budget vs spend', 'Employee attendance stats', or 'Sales pipeline breakdown'"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary text-body-md"
              />
            </div>
            <button
              type="submit"
              disabled={queryLoading}
              className="px-6 py-2.5 rounded-xl bg-primary-container/20 text-primary border border-primary/30 font-semibold hover:bg-primary-container/40 transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">{queryLoading ? 'hourglass_empty' : 'send'}</span>
              Query Data
            </button>
          </form>

          {/* Quick Preset Query Tags */}
          <div className="flex flex-wrap gap-xs items-center">
            <span className="text-label-md text-on-surface-variant font-medium">Quick Prompts:</span>
            {[
              'Department budget vs spend',
              'Employee attendance & HR',
              'Sales SDR pipeline conversion',
              'Agent token cost audit'
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleQuerySubmit(prompt)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-surface-container-high border border-outline-variant hover:border-primary/50 text-on-surface-variant hover:text-primary transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Query Result Pane */}
          {queryResult && (
            <div className="mt-md p-md rounded-xl bg-surface-container-low border border-primary/30 space-y-md animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-primary uppercase">Generated SQL Query</span>
                <span className="text-xs text-on-surface-variant">Read-Only Enforced</span>
              </div>
              <pre className="p-sm rounded-lg bg-black/40 text-emerald-400 font-mono text-xs overflow-x-auto">
                {queryResult.generated_sql}
              </pre>

              <div className="p-sm rounded-lg bg-surface-container border border-outline-variant">
                <h4 className="text-xs font-bold text-on-surface uppercase mb-1">AI Executive Insight Summary</h4>
                <p className="text-body-md text-on-surface-variant">{queryResult.insights_summary}</p>
              </div>

              {queryResult.visualization_config && (
                <div className="space-y-sm">
                  <h4 className="text-xs font-bold text-on-surface uppercase">Visual Breakdown Table</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-on-surface">
                      <thead className="bg-surface-container border-b border-outline-variant">
                        <tr>
                          {Object.keys(queryResult.visualization_config.data[0] || {}).map((col) => (
                            <th key={col} className="p-2 capitalize font-semibold text-xs text-on-surface-variant">
                              {col.replace('_', ' ')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {queryResult.visualization_config.data.map((row, idx) => (
                          <tr key={idx} className="hover:bg-surface-container-high/50">
                            {Object.values(row).map((val, vIdx) => (
                              <td key={vIdx} className="p-2 text-xs font-medium">
                                {typeof val === 'number' ? val.toLocaleString() : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Executive Quick-View Widgets Grid */}
        <div>
          <div className="flex items-center justify-between mb-md">
            <h2 className="font-title-lg text-title-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">dashboard_customize</span>
              Executive Quick-View Dashboard
            </h2>
            <span className="text-xs text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {/* Widget 1: Employee Data */}
            <div className="p-lg rounded-2xl bg-surface-container border border-outline-variant space-y-md hover:border-primary/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400">groups</span>
                  <h3 className="font-title-md text-title-md font-bold text-on-surface">Employee Data</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/60">
                  HR Module
                </span>
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Active Workforce</p>
                  <p className="text-2xl font-extrabold text-on-surface mt-1">
                    {quickview?.employee_metrics?.total_employees || 42}
                  </p>
                </div>
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Attendance Rate</p>
                  <p className="text-2xl font-extrabold text-emerald-400 mt-1">
                    {quickview?.employee_metrics?.attendance_rate || 95.2}%
                  </p>
                </div>
              </div>

              <div className="space-y-xs text-xs text-on-surface-variant pt-xs">
                <div className="flex justify-between">
                  <span>Present Today:</span>
                  <span className="font-bold text-on-surface">{quickview?.employee_metrics?.present_today || 40}</span>
                </div>
                <div className="flex justify-between">
                  <span>Approved Leaves:</span>
                  <span className="font-bold text-on-surface">{quickview?.employee_metrics?.on_leave || 2}</span>
                </div>
                <div className="flex justify-between">
                  <span>Resumes Screened:</span>
                  <span className="font-bold text-on-surface">{quickview?.employee_metrics?.resumes_screened || 128}</span>
                </div>
              </div>
            </div>

            {/* Widget 2: Finances */}
            <div className="p-lg rounded-2xl bg-surface-container border border-outline-variant space-y-md hover:border-primary/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400">account_balance</span>
                  <h3 className="font-title-md text-title-md font-bold text-on-surface">Financial Overview</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                  Finance
                </span>
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Total Budget</p>
                  <p className="text-xl font-extrabold text-on-surface mt-1">
                    ${(quickview?.financial_metrics?.total_budget || 250000).toLocaleString()}
                  </p>
                </div>
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Total Spent</p>
                  <p className="text-xl font-extrabold text-amber-400 mt-1">
                    ${(quickview?.financial_metrics?.total_spent || 142500).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="space-y-xs text-xs text-on-surface-variant pt-xs">
                <div className="flex justify-between">
                  <span>Budget Utilization:</span>
                  <span className="font-bold text-amber-400">{quickview?.financial_metrics?.budget_utilization_pct || 57.0}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Monthly Revenue:</span>
                  <span className="font-bold text-emerald-400">${(quickview?.financial_metrics?.monthly_revenue || 185000).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gross Profit Margin:</span>
                  <span className="font-bold text-on-surface">{quickview?.financial_metrics?.gross_margin_pct || 68.4}%</span>
                </div>
              </div>
            </div>

            {/* Widget 3: Projects & Dev */}
            <div className="p-lg rounded-2xl bg-surface-container border border-outline-variant space-y-md hover:border-primary/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-400">code</span>
                  <h3 className="font-title-md text-title-md font-bold text-on-surface">Projects & Dev</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-950/60 text-purple-400 border border-purple-800/60">
                  PM & Coding
                </span>
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Active Projects</p>
                  <p className="text-2xl font-extrabold text-on-surface mt-1">
                    {quickview?.project_metrics?.active_projects || 8}
                  </p>
                </div>
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Open GitHub PRs</p>
                  <p className="text-2xl font-extrabold text-purple-400 mt-1">
                    {quickview?.project_metrics?.github_open_prs || 5}
                  </p>
                </div>
              </div>

              <div className="space-y-xs text-xs text-on-surface-variant pt-xs">
                <div className="flex justify-between">
                  <span>Completed Milestones:</span>
                  <span className="font-bold text-on-surface">{quickview?.project_metrics?.completed_milestones || 34}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pending Milestones:</span>
                  <span className="font-bold text-on-surface">{quickview?.project_metrics?.pending_milestones || 12}</span>
                </div>
                <div className="flex justify-between">
                  <span>Weekly Commits:</span>
                  <span className="font-bold text-on-surface">{quickview?.project_metrics?.weekly_commits || 142}</span>
                </div>
              </div>
            </div>

            {/* Widget 4: Sales Pipeline */}
            <div className="p-lg rounded-2xl bg-surface-container border border-outline-variant space-y-md hover:border-primary/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-orange-400">trending_up</span>
                  <h3 className="font-title-md text-title-md font-bold text-on-surface">Sales & SDR</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-orange-950/60 text-orange-400 border border-orange-800/60">
                  Sales SDR
                </span>
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Total Prospects</p>
                  <p className="text-2xl font-extrabold text-on-surface mt-1">
                    {quickview?.sales_metrics?.total_prospects || 350}
                  </p>
                </div>
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Qualified Leads</p>
                  <p className="text-2xl font-extrabold text-orange-400 mt-1">
                    {quickview?.sales_metrics?.qualified_leads || 84}
                  </p>
                </div>
              </div>

              <div className="space-y-xs text-xs text-on-surface-variant pt-xs">
                <div className="flex justify-between">
                  <span>Hunter.io Deliverability:</span>
                  <span className="font-bold text-emerald-400">{quickview?.sales_metrics?.deliverability_rate || 98.4}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Outreach Emails Sent:</span>
                  <span className="font-bold text-on-surface">{quickview?.sales_metrics?.outreach_sent || 210}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deal Conversion Rate:</span>
                  <span className="font-bold text-orange-400">{quickview?.sales_metrics?.conversion_rate || 14.2}%</span>
                </div>
              </div>
            </div>

            {/* Widget 5: Procurement */}
            <div className="p-lg rounded-2xl bg-surface-container border border-outline-variant space-y-md hover:border-primary/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-400">shopping_cart</span>
                  <h3 className="font-title-md text-title-md font-bold text-on-surface">Procurement</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
                  Procurement
                </span>
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Active RFQs</p>
                  <p className="text-2xl font-extrabold text-on-surface mt-1">
                    {quickview?.procurement_metrics?.active_rfqs || 6}
                  </p>
                </div>
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Procurement Spend</p>
                  <p className="text-xl font-extrabold text-cyan-400 mt-1">
                    ${(quickview?.procurement_metrics?.total_procurement_spend || 58400).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="space-y-xs text-xs text-on-surface-variant pt-xs">
                <div className="flex justify-between">
                  <span>Pending PO Approvals:</span>
                  <span className="font-bold text-on-surface">{quickview?.procurement_metrics?.pending_po_approvals || 3}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Vendor Lead Time:</span>
                  <span className="font-bold text-cyan-400">{quickview?.procurement_metrics?.avg_vendor_lead_time_days || 4.5} Days</span>
                </div>
              </div>
            </div>

            {/* Widget 6: AI Health & Token Cost */}
            <div className="p-lg rounded-2xl bg-surface-container border border-outline-variant space-y-md hover:border-primary/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-rose-400">memory</span>
                  <h3 className="font-title-md text-title-md font-bold text-on-surface">AI Agent Health</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-800/60">
                  Platform Audit
                </span>
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Agent Executions</p>
                  <p className="text-2xl font-extrabold text-on-surface mt-1">
                    {quickview?.ai_health_metrics?.total_agent_runs || 1420}
                  </p>
                </div>
                <div className="p-sm rounded-xl bg-surface-container-low border border-outline-variant">
                  <p className="text-xs text-on-surface-variant">Tokens Consumed</p>
                  <p className="text-2xl font-extrabold text-rose-400 mt-1">
                    {((quickview?.ai_health_metrics?.llm_tokens_consumed || 458000) / 1000).toFixed(0)}k
                  </p>
                </div>
              </div>

              <div className="space-y-xs text-xs text-on-surface-variant pt-xs">
                <div className="flex justify-between">
                  <span>Execution Success Rate:</span>
                  <span className="font-bold text-emerald-400">{quickview?.ai_health_metrics?.success_rate_pct || 99.4}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Latency:</span>
                  <span className="font-bold text-on-surface">{quickview?.ai_health_metrics?.avg_response_time_ms || 1240} ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Est Token Cost:</span>
                  <span className="font-bold text-rose-400">${quickview?.ai_health_metrics?.estimated_token_cost_usd || 18.32} USD</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Anomaly & Risk Alerts Feed */}
        <div className="p-lg rounded-2xl bg-surface-container border border-outline-variant space-y-md">
          <div className="flex items-center justify-between">
            <h2 className="font-title-md text-title-md font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400">warning</span>
              Active Anomaly & Risk Feed
            </h2>
            <span className="text-xs text-on-surface-variant font-medium">{alerts.length} Alerts Active</span>
          </div>

          <div className="space-y-sm">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-md rounded-xl border flex items-start gap-md ${
                  alert.severity === 'CRITICAL'
                    ? 'bg-red-950/20 border-red-800/40 text-red-300'
                    : alert.severity === 'WARNING'
                    ? 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                    : 'bg-blue-950/20 border-blue-800/40 text-blue-300'
                }`}
              >
                <span className="material-symbols-outlined mt-0.5 text-xl">
                  {alert.severity === 'CRITICAL' ? 'report' : alert.severity === 'WARNING' ? 'warning' : 'info'}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm">{alert.title}</h4>
                    <span className="text-xs opacity-75 font-mono">{new Date(alert.created_at).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs mt-1 opacity-90">{alert.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Executive Briefing Modal */}
      {isDigestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto p-lg rounded-2xl bg-surface border border-outline-variant shadow-2xl space-y-md">
            <div className="flex items-center justify-between border-b border-outline-variant pb-md">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-2xl">summarize</span>
                <h3 className="font-title-lg text-title-lg font-bold text-on-surface">Executive AI Briefing Digest</h3>
              </div>
              <button
                onClick={() => setIsDigestOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {digestLoading ? (
              <div className="py-xl text-center space-y-md">
                <span className="material-symbols-outlined text-4xl text-primary animate-spin">sync</span>
                <p className="text-body-md text-on-surface-variant">Synthesizing platform data into Executive Digest...</p>
              </div>
            ) : (
              <div className="space-y-md">
                <div className="p-md rounded-xl bg-surface-container border border-outline-variant font-mono text-sm text-on-surface whitespace-pre-wrap">
                  {digestContent}
                </div>

                <div className="flex justify-end gap-sm">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(digestContent);
                      alert('Digest copied to clipboard!');
                    }}
                    className="px-4 py-2 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-label-md font-semibold hover:bg-surface-container"
                  >
                    Copy Markdown
                  </button>
                  <button
                    onClick={() => setIsDigestOpen(false)}
                    className="px-4 py-2 rounded-xl bg-primary text-on-primary text-label-md font-semibold hover:bg-primary/90"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
