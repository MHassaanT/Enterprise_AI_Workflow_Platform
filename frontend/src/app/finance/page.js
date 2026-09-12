"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import { getAuthHeader } from '@/lib/api';

export default function FinanceDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('all'); // 'all' | 'stripe' | 'safepay'
  const [selectedPeriod, setSelectedPeriod] = useState(30); // 7 | 30 | 90
  const [overview, setOverview] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState({
    stripe: { connected: false },
    safepay: { connected: false },
  });
  
  // Search & Filter state for Transactions Ledger
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'succeeded' | 'refunded' | 'failed'
  
  // Interactive SVG chart state
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // AI Financial Briefing state
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(true);

  const API_BASE = '/api/v1/finance';

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function fetchFinanceData() {
      try {
        const authHeaders = getAuthHeader();

        // 1. Fetch connection status
        const statusRes = await fetch(`${API_BASE}/status`, { headers: { ...authHeaders } });
        const statusData = await statusRes.json();
        if (!ignore && statusData.status) {
          setConnectionStatus(statusData.status);
        }

        // 2. Fetch financial overview
        const overviewRes = await fetch(
          `${API_BASE}/overview?provider=${selectedProvider}&period_days=${selectedPeriod}`,
          { headers: { ...authHeaders } }
        );
        const overviewData = await overviewRes.json();
        if (!ignore && overviewData.data) {
          setOverview(overviewData.data);
        }
      } catch (err) {
        console.error('Error loading finance intelligence:', err);
      } finally {
        if (!ignore) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    fetchFinanceData();

    return () => {
      ignore = true;
    };
  }, [selectedProvider, selectedPeriod, refreshKey]);

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
  };

  const generateAiBriefing = async () => {
    try {
      setAiLoading(true);
      setIsAiOpen(true);
      const res = await fetch(`${API_BASE}/insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.insights && data.insights.insights_markdown) {
        setAiInsights(data.insights.insights_markdown);
      }
    } catch (err) {
      console.error('Failed to generate AI insights:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const formatCurrencyUSD = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const formatCurrencyPKR = (amount) => {
    return `Rs. ${(Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const txs = overview?.transactions || [];
    return txs.filter((tx) => {
      // Provider filter
      if (selectedProvider !== 'all' && tx.provider?.toLowerCase() !== selectedProvider.toLowerCase()) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && tx.status?.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = tx.customer_name?.toLowerCase().includes(q);
        const matchesEmail = tx.customer_email?.toLowerCase().includes(q);
        const matchesDesc = tx.description?.toLowerCase().includes(q);
        const matchesId = tx.id?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesDesc && !matchesId) {
          return false;
        }
      }
      return true;
    });
  }, [overview, selectedProvider, statusFilter, searchQuery]);

  // Export filtered transactions to CSV
  const exportCsv = () => {
    if (!filteredTransactions.length) return;
    const headers = ['Transaction ID', 'Provider', 'Type', 'Amount (Native)', 'Currency', 'Amount (USD)', 'Net (USD)', 'Fee (USD)', 'Status', 'Customer Name', 'Customer Email', 'Description', 'Date'];
    const rows = filteredTransactions.map(t => [
      t.id,
      t.provider,
      t.type,
      t.amount,
      t.currency,
      t.amount_usd || t.amount,
      t.net,
      t.fee,
      t.status,
      `"${t.customer_name || ''}"`,
      t.customer_email,
      `"${t.description || ''}"`,
      t.created_at
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financial_report_${selectedProvider}_${selectedPeriod}d.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = useMemo(() => overview?.summary || {}, [overview]);
  const timeline = useMemo(() => overview?.charts?.timeline || [], [overview]);
  const distribution = useMemo(() => overview?.charts?.distribution || [], [overview]);
  const neitherConnected = !connectionStatus?.stripe?.connected && !connectionStatus?.safepay?.connected && !overview?.is_demo_mode;

  // Chart rendering helpers
  const chartHeight = 220;
  const chartWidth = 700;
  const paddingX = 40;
  const paddingY = 30;

  const isPKRPrimary = selectedProvider !== 'stripe';

  const maxVal = useMemo(() => {
    if (!timeline.length) return isPKRPrimary ? 25000 : 100;
    const maxGross = Math.max(
      ...timeline.map(p => (isPKRPrimary ? (p.gross_pkr || p.safepay_pkr || (p.gross * 277.2)) : p.gross) || 0)
    );
    return Math.max(maxGross * 1.15, isPKRPrimary ? 25000 : 100);
  }, [timeline, isPKRPrimary]);

  const pointsGross = useMemo(() => {
    if (!timeline.length) return '';
    return timeline.map((p, i) => {
      const val = isPKRPrimary ? (p.gross_pkr || p.safepay_pkr || (p.gross * 277.2)) : p.gross;
      const x = paddingX + (i / Math.max(timeline.length - 1, 1)) * (chartWidth - paddingX * 2);
      const y = chartHeight - paddingY - ((val || 0) / maxVal) * (chartHeight - paddingY * 2);
      return `${x},${y}`;
    }).join(' ');
  }, [timeline, maxVal, isPKRPrimary]);

  const pointsRefunds = useMemo(() => {
    if (!timeline.length) return '';
    return timeline.map((p, i) => {
      const val = isPKRPrimary ? (p.refunds_pkr || (p.refunds * 277.2)) : p.refunds;
      const x = paddingX + (i / Math.max(timeline.length - 1, 1)) * (chartWidth - paddingX * 2);
      const y = chartHeight - paddingY - ((val || 0) / maxVal) * (chartHeight - paddingY * 2);
      return `${x},${y}`;
    }).join(' ');
  }, [timeline, maxVal, isPKRPrimary]);

  const areaPathGross = useMemo(() => {
    if (!timeline.length) return '';
    const firstX = paddingX;
    const lastX = paddingX + (chartWidth - paddingX * 2);
    const bottomY = chartHeight - paddingY;
    return `M ${firstX},${bottomY} L ${pointsGross.replace(/ /g, ' L ')} L ${lastX},${bottomY} Z`;
  }, [pointsGross, timeline]);

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background text-on-surface flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-primary text-5xl animate-spin">sync</span>
            <h2 className="text-xl font-bold tracking-wide">Connecting Payment Gateways & Ledger...</h2>
            <p className="text-sm text-on-surface-variant">Syncing SafePay & Stripe MCP accounts</p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface flex flex-col h-screen overflow-hidden">
        
        {/* Top App Header */}
        <header className="border-b border-outline-variant bg-surface px-6 py-3 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors flex items-center p-1 rounded-full hover:bg-surface-variant">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-md">
                <span className="material-symbols-outlined text-white text-[22px]">account_balance_wallet</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-headline-sm text-lg font-extrabold text-on-surface m-0 leading-tight">Finance Agent</h1>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                    Payment Intelligence
                  </span>
                  {overview?.is_demo_mode && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Sandbox Simulation
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant m-0">
                  Unified cashflow, balances & transaction ledger for SafePay & Stripe accounts
                </p>
              </div>
            </div>
          </div>

          {/* Header Controls & Gateway Status Badges */}
          <div className="flex items-center gap-3">
            {/* Stripe Status Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-variant/40 text-xs">
              <span className={`w-2 h-2 rounded-full ${connectionStatus?.stripe?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              <span className="font-medium text-on-surface">Stripe:</span>
              <span className={connectionStatus?.stripe?.connected ? 'text-emerald-400 font-bold' : 'text-on-surface-variant'}>
                {connectionStatus?.stripe?.connected ? 'Connected' : 'Not Connected'}
              </span>
              {!connectionStatus?.stripe?.connected && (
                <Link href="/mcp" className="ml-1 text-[11px] text-primary hover:underline font-bold">
                  Connect
                </Link>
              )}
            </div>

            {/* SafePay Status Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-variant/40 text-xs">
              <span className={`w-2 h-2 rounded-full ${connectionStatus?.safepay?.connected ? 'bg-indigo-400 animate-pulse' : 'bg-zinc-500'}`} />
              <span className="font-medium text-on-surface">SafePay:</span>
              <span className={connectionStatus?.safepay?.connected ? 'text-indigo-400 font-bold' : 'text-on-surface-variant'}>
                {connectionStatus?.safepay?.connected ? 'Connected' : 'Not Connected'}
              </span>
              {!connectionStatus?.safepay?.connected && (
                <Link href="/mcp" className="ml-1 text-[11px] text-primary hover:underline font-bold">
                  Connect
                </Link>
              )}
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-1.5 bg-surface-variant hover:bg-outline-variant rounded-lg text-xs font-semibold text-on-surface transition-colors flex items-center gap-1.5 border border-outline-variant shadow-sm"
              title="Refresh ledger and accounts"
            >
              <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
              Refresh
            </button>
          </div>
        </header>

        {/* Filter Navigation Bar: Accounts & Time Periods */}
        <section className="bg-surface border-b border-outline-variant px-6 py-2 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          {/* Account Filter Pills */}
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant text-xs">
            <button
              onClick={() => setSelectedProvider('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                selectedProvider === 'all'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/60'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">layers</span>
              All Accounts (Combined)
            </button>

            <button
              onClick={() => setSelectedProvider('stripe')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                selectedProvider === 'stripe'
                  ? 'bg-[#635bff] text-white shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/60'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">credit_card</span>
              Stripe Account
            </button>

            <button
              onClick={() => setSelectedProvider('safepay')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                selectedProvider === 'safepay'
                  ? 'bg-[#4f46e5] text-white shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/60'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">payments</span>
              SafePay Account
            </button>
          </div>

          {/* Timeframe Selector & Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant text-xs">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setSelectedPeriod(days)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    selectedPeriod === days
                      ? 'bg-surface-variant text-on-surface font-bold border border-outline-variant shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {days}D
                </button>
              ))}
            </div>

            <button
              onClick={generateAiBriefing}
              disabled={aiLoading}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <span className={`material-symbols-outlined text-[16px] ${aiLoading ? 'animate-spin' : ''}`}>
                {aiLoading ? 'sync' : 'auto_awesome'}
              </span>
              AI Financial Brief
            </button>

            <button
              onClick={exportCsv}
              disabled={!filteredTransactions.length}
              className="px-3 py-1.5 bg-surface-variant hover:bg-outline-variant rounded-lg text-xs font-semibold text-on-surface transition-colors flex items-center gap-1.5 border border-outline-variant shadow-xs"
              title="Download CSV report"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export CSV
            </button>
          </div>
        </section>

        {/* Zero-State Warning Banner if neither is connected */}
        {neitherConnected && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-center justify-between text-amber-200">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-2xl">warning</span>
              <div>
                <p className="font-bold text-sm">No Live Payment Gateway Connected</p>
                <p className="text-xs text-amber-300/80">
                  Connect your Stripe Restricted Key or SafePay Secret Key in the Integrations Hub to activate automated financial intelligence.
                </p>
              </div>
            </div>
            <Link
              href="/mcp"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition-colors shadow"
            >
              Connect Gateways Now
            </Link>
          </div>
        )}

        {/* Main Dashboard Scrollable Content */}
        <main className="flex-1 overflow-auto p-6 space-y-6">
          
          {/* Section 1: Executive KPI Cards with Up/Down Trend Indicators */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* KPI 1: Gross Inflow */}
            <div className="p-4 rounded-xl bg-surface border border-outline-variant shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-on-surface-variant text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider">Gross Inflow</span>
                  <span className="material-symbols-outlined text-emerald-400 text-lg">arrow_downward_alt</span>
                </div>
                <div className="text-2xl font-extrabold text-on-surface mt-1">
                  {selectedProvider === 'stripe'
                    ? formatCurrencyUSD(summary.gross_volume_usd)
                    : formatCurrencyPKR(summary.gross_volume_pkr || 0)}
                </div>
                {selectedProvider === 'stripe' ? null : selectedProvider === 'all' && (summary.native_summaries?.stripe?.gross > 0) ? (
                  <div className="text-xs text-indigo-400 font-medium mt-0.5">
                    + {formatCurrencyUSD(summary.native_summaries.stripe.gross)} (Stripe)
                  </div>
                ) : (
                  <div className="text-xs text-on-surface-variant font-medium mt-0.5">
                    {selectedProvider === 'safepay' ? 'SafePay Inflow' : 'Combined Inflow'}
                  </div>
                )}
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/60 flex items-center justify-between text-xs">
                <span className={`inline-flex items-center gap-0.5 font-bold ${summary.gross_trend_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span className="material-symbols-outlined text-[14px]">
                    {summary.gross_trend_pct >= 0 ? 'trending_up' : 'trending_down'}
                  </span>
                  {summary.gross_trend_pct >= 0 ? `+${summary.gross_trend_pct}%` : `${summary.gross_trend_pct}%`}
                </span>
                <span className="text-[11px] text-on-surface-variant">vs previous {selectedPeriod}d</span>
              </div>
            </div>

            {/* KPI 2: Net Realized Revenue */}
            <div className="p-4 rounded-xl bg-surface border border-outline-variant shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-on-surface-variant text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider">Net Realized</span>
                  <span className="material-symbols-outlined text-teal-400 text-lg">account_balance</span>
                </div>
                <div className="text-2xl font-extrabold text-emerald-400 mt-1">
                  {selectedProvider === 'stripe'
                    ? formatCurrencyUSD(summary.net_volume_usd)
                    : formatCurrencyPKR(summary.net_volume_pkr || 0)}
                </div>
                {selectedProvider === 'stripe' ? null : selectedProvider === 'all' && (summary.native_summaries?.stripe?.net > 0) ? (
                  <div className="text-xs text-emerald-400/80 font-medium mt-0.5">
                    + {formatCurrencyUSD(summary.native_summaries.stripe.net)} (Stripe)
                  </div>
                ) : (
                  <div className="text-xs text-on-surface-variant font-medium mt-0.5">
                    {selectedProvider === 'safepay' ? 'SafePay Net' : 'Combined Realized'}
                  </div>
                )}
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/60 flex items-center justify-between text-xs">
                <span className={`inline-flex items-center gap-0.5 font-bold ${summary.net_trend_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span className="material-symbols-outlined text-[14px]">
                    {summary.net_trend_pct >= 0 ? 'trending_up' : 'trending_down'}
                  </span>
                  {summary.net_trend_pct >= 0 ? `+${summary.net_trend_pct}%` : `${summary.net_trend_pct}%`}
                </span>
                <span className="text-[11px] text-on-surface-variant">after fees & refunds</span>
              </div>
            </div>

            {/* KPI 3: Total Refunds / Outflows */}
            <div className="p-4 rounded-xl bg-surface border border-outline-variant shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-on-surface-variant text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider">Refunds & Outflows</span>
                  <span className="material-symbols-outlined text-rose-400 text-lg">undo</span>
                </div>
                <div className="text-2xl font-extrabold text-rose-400 mt-1">
                  {selectedProvider === 'stripe'
                    ? formatCurrencyUSD(summary.refunds_volume_usd)
                    : formatCurrencyPKR(summary.refunds_volume_pkr || 0)}
                </div>
                {selectedProvider === 'stripe' ? null : selectedProvider === 'all' && (summary.native_summaries?.stripe?.refunds > 0) ? (
                  <div className="text-xs text-rose-400/80 font-medium mt-0.5">
                    + {formatCurrencyUSD(summary.native_summaries.stripe.refunds)} (Stripe)
                  </div>
                ) : (
                  <div className="text-xs text-on-surface-variant font-medium mt-0.5">
                    {summary.refunds_volume_pkr > 0 ? 'SafePay Reversals' : 'Zero chargebacks'}
                  </div>
                )}
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/60 flex items-center justify-between text-xs">
                <span className={`inline-flex items-center gap-0.5 font-bold ${summary.refunds_trend_pct <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span className="material-symbols-outlined text-[14px]">
                    {summary.refunds_trend_pct <= 0 ? 'trending_down' : 'trending_up'}
                  </span>
                  {summary.refunds_trend_pct > 0 ? `+${summary.refunds_trend_pct}%` : `${summary.refunds_trend_pct}%`}
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  {((summary.refunds_volume_usd / (summary.gross_volume_usd || 1)) * 100).toFixed(1)}% refund rate
                </span>
              </div>
            </div>

            {/* KPI 4: Liquid Available Balances */}
            <div className="p-4 rounded-xl bg-surface border border-outline-variant shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-on-surface-variant text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider">Available Balances</span>
                  <span className="material-symbols-outlined text-blue-400 text-lg">savings</span>
                </div>
                <div className="text-lg font-bold text-on-surface mt-1 truncate">
                  {selectedProvider === 'stripe'
                    ? formatCurrencyUSD(summary.balances?.stripe_available_usd || 0)
                    : formatCurrencyPKR(summary.balances?.safepay_available_pkr || summary.gross_volume_pkr || 0)}
                </div>
                {selectedProvider === 'all' ? (
                  <div className="text-xs text-indigo-400 font-semibold truncate mt-0.5">
                    + {formatCurrencyUSD(summary.balances?.stripe_available_usd || 0)} (Stripe)
                  </div>
                ) : selectedProvider === 'safepay' ? (
                  <div className="text-xs text-indigo-400 font-semibold truncate mt-0.5">
                    SafePay Sandbox Account
                  </div>
                ) : null}
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant">
                <span>{selectedProvider === 'safepay' ? 'SafePay' : selectedProvider === 'stripe' ? 'Stripe' : 'Stripe & SafePay'}</span>
                <span className="text-emerald-400 font-bold">Ready for sweep</span>
              </div>
            </div>

            {/* KPI 5: Success Authorization Rate */}
            <div className="p-4 rounded-xl bg-surface border border-outline-variant shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-on-surface-variant text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider">Success Rate</span>
                  <span className="material-symbols-outlined text-emerald-400 text-lg">verified</span>
                </div>
                <div className="text-2xl font-extrabold text-on-surface mt-1">
                  {summary.success_rate ?? 100}%
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant">
                <span className="text-emerald-400 font-bold">{summary.successful_transactions || 0} passed</span>
                <span className="text-rose-400 font-bold">{summary.failed_transactions || 0} failed</span>
              </div>
            </div>

          </section>

          {/* Section 2: AI Financial Briefing Widget */}
          {aiInsights && isAiOpen && (
            <section className="p-5 rounded-2xl bg-gradient-to-r from-surface-container to-surface border border-primary/30 shadow-md relative overflow-hidden transition-all">
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant/70 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                  </div>
                  <div>
                    <h3 className="font-title-sm font-bold text-on-surface m-0">Gemini CFO AI Briefing</h3>
                    <p className="text-[11px] text-on-surface-variant m-0">Autonomous multi-gateway cash flow and risk intelligence</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={generateAiBriefing}
                    disabled={aiLoading}
                    className="px-2.5 py-1 text-xs bg-surface-variant hover:bg-outline-variant rounded-md font-semibold text-on-surface flex items-center gap-1 border border-outline-variant"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${aiLoading ? 'animate-spin' : ''}`}>sync</span>
                    Regenerate
                  </button>
                  <button
                    onClick={() => setIsAiOpen(false)}
                    className="p-1 text-on-surface-variant hover:text-on-surface rounded-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>

              <div className="text-xs text-on-surface leading-relaxed space-y-2 prose prose-invert max-w-none">
                {aiInsights.split('\n\n').map((para, i) => (
                  <p key={i} className="m-0">{para}</p>
                ))}
              </div>
            </section>
          )}

          {/* Section 3: Interactive Graphs Grid (Cashflow Area Chart & Gateway Volume Split) */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Cashflow Up & Down Trend Timeline Chart */}
            <div className="lg:col-span-2 p-5 rounded-2xl bg-surface border border-outline-variant shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-outline-variant pb-3 mb-3">
                <div>
                  <h3 className="font-title-md font-bold text-on-surface m-0 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">show_chart</span>
                    Cashflow Trends (Inflow vs. Outflows)
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Daily processing volume over the last {selectedPeriod} days
                  </p>
                </div>

                {/* Graph Legend */}
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500 shadow-xs" />
                    <span className="text-on-surface">Gross Inflow</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-rose-500 shadow-xs" />
                    <span className="text-on-surface">Refunds / Outflows</span>
                  </div>
                </div>
              </div>

              {/* Native SVG Responsive Chart */}
              <div className="relative w-full h-[220px]">
                {timeline.length > 0 ? (
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    className="w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="grossGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
                      </linearGradient>
                      <linearGradient id="refundGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.30" />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.00" />
                      </linearGradient>
                    </defs>

                    {/* Grid Lines */}
                    {[0.25, 0.5, 0.75, 1.0].map((ratio, idx) => {
                      const y = chartHeight - paddingY - ratio * (chartHeight - paddingY * 2);
                      const displayVal = Math.round(ratio * maxVal);
                      return (
                        <g key={idx}>
                          <line
                            x1={paddingX}
                            y1={y}
                            x2={chartWidth - paddingX}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity="0.1"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={paddingX - 6}
                            y={y + 3}
                            fill="currentColor"
                            opacity="0.4"
                            fontSize="9"
                            textAnchor="end"
                          >
                            {isPKRPrimary
                              ? `Rs. ${displayVal >= 1000 ? `${(displayVal / 1000).toFixed(0)}k` : displayVal}`
                              : `$${displayVal}`}
                          </text>
                        </g>
                      );
                    })}

                    {/* Area fill for Gross Inflow */}
                    {areaPathGross && (
                      <path d={areaPathGross} fill="url(#grossGradient)" />
                    )}

                    {/* Line for Gross Inflow */}
                    {pointsGross && (
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={pointsGross}
                      />
                    )}

                    {/* Line for Refunds Outflow */}
                    {pointsRefunds && (
                      <polyline
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="1.8"
                        strokeDasharray="3 3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={pointsRefunds}
                      />
                    )}

                    {/* Interactive points & hover detection */}
                    {timeline.map((point, index) => {
                      const val = isPKRPrimary ? (point.gross_pkr || point.safepay_pkr || (point.gross * 277.2)) : point.gross;
                      const x = paddingX + (index / Math.max(timeline.length - 1, 1)) * (chartWidth - paddingX * 2);
                      const yGross = chartHeight - paddingY - ((val || 0) / maxVal) * (chartHeight - paddingY * 2);

                      return (
                        <g key={point.date}>
                          <circle
                            cx={x}
                            cy={yGross}
                            r={hoveredPoint?.date === point.date ? 5 : 2.5}
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth={hoveredPoint?.date === point.date ? 2 : 1}
                            className="cursor-pointer transition-all"
                            onMouseEnter={() => setHoveredPoint(point)}
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                        </g>
                      );
                    })}
                  </svg>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-on-surface-variant italic">
                    No time-series payment data available for the selected range.
                  </div>
                )}

                {/* Floating Interactive Hover Tooltip */}
                {hoveredPoint && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-surface-container border border-outline rounded-xl p-2.5 shadow-xl text-xs z-30 pointer-events-none min-w-[200px]">
                    <div className="font-bold text-on-surface border-b border-outline-variant pb-1 mb-1.5 flex justify-between">
                      <span>{hoveredPoint.date}</span>
                      <span className="text-emerald-400 font-extrabold">
                        {isPKRPrimary
                          ? formatCurrencyPKR(hoveredPoint.gross_pkr || hoveredPoint.safepay_pkr || (hoveredPoint.gross * 277.2))
                          : formatCurrencyUSD(hoveredPoint.gross)}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-[11px] text-on-surface-variant">
                      <div className="flex justify-between">
                        <span>Net Volume:</span>
                        <span className="font-semibold text-on-surface">
                          {isPKRPrimary
                            ? formatCurrencyPKR((hoveredPoint.gross_pkr || hoveredPoint.safepay_pkr || (hoveredPoint.gross * 277.2)) * 0.975)
                            : formatCurrencyUSD(hoveredPoint.net)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Refunds Outflow:</span>
                        <span className="font-semibold text-rose-400">
                          {isPKRPrimary
                            ? formatCurrencyPKR(hoveredPoint.refunds_pkr || ((hoveredPoint.refunds || 0) * 277.2))
                            : formatCurrencyUSD(hoveredPoint.refunds)}
                        </span>
                      </div>
                      {hoveredPoint.stripe_volume !== undefined && (
                        <div className="flex justify-between text-[10px] pt-1 border-t border-outline-variant/60">
                          <span>Stripe / SafePay:</span>
                          <span>
                            {formatCurrencyUSD(hoveredPoint.stripe_volume)} / {formatCurrencyPKR(hoveredPoint.gross_pkr || hoveredPoint.safepay_pkr || (hoveredPoint.safepay_volume * 277.2))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Chart Date Range Labels */}
              <div className="flex justify-between text-[11px] text-on-surface-variant pt-2 border-t border-outline-variant/40 mt-2">
                <span>{timeline[0]?.date || 'Start'}</span>
                <span>{timeline[Math.floor(timeline.length / 2)]?.date || 'Mid'}</span>
                <span>{timeline[timeline.length - 1]?.date || 'Today'}</span>
              </div>
            </div>

            {/* Right 1 Col: Gateway Volume Distribution */}
            <div className="p-5 rounded-2xl bg-surface border border-outline-variant shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-outline-variant pb-3 mb-4">
                  <div>
                    <h3 className="font-title-md font-bold text-on-surface m-0 flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-400 text-xl">pie_chart</span>
                      Gateway Contribution
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Share of gross processing volume
                    </p>
                  </div>
                </div>

                {/* Contribution Stacked Bar */}
                <div className="w-full h-4 rounded-full bg-surface-container-low overflow-hidden flex shadow-inner mb-4">
                  {distribution.map((dist) => (
                    <div
                      key={dist.provider}
                      style={{
                        width: `${dist.percentage}%`,
                        backgroundColor: dist.color,
                      }}
                      className="h-full transition-all duration-500 hover:opacity-90"
                      title={`${dist.name}: ${dist.percentage}%`}
                    />
                  ))}
                </div>

                {/* Gateway Detail Cards */}
                <div className="space-y-3">
                  {distribution.map((dist) => {
                    const isDistStripe = dist.provider === 'stripe';
                    const isPKR = dist.currency === 'PKR' || dist.provider === 'safepay';

                    return (
                      <div
                        key={dist.provider}
                        className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between hover:border-outline transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold shadow-xs"
                            style={{ backgroundColor: dist.color }}
                          >
                            <span className="material-symbols-outlined text-[18px]">{dist.icon || 'payments'}</span>
                          </div>
                          <div>
                            <p className="font-bold text-xs text-on-surface m-0 leading-tight">{dist.name}</p>
                            <p className="text-[11px] text-on-surface-variant m-0">
                              {isPKR
                                ? `${dist.percentage}% share • PKR Gateway`
                                : `${dist.percentage}% share • USD Gateway`}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="font-extrabold text-xs text-on-surface m-0">
                            {isPKR
                              ? formatCurrencyPKR(dist.volume_native || summary.gross_volume_pkr || 0)
                              : formatCurrencyUSD(dist.volume_usd)}
                          </p>
                          <p className="text-[10px] font-bold text-emerald-400 m-0">
                            {dist.percentage}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-outline-variant/60 text-center">
                <Link
                  href="/mcp"
                  className="text-xs text-primary hover:underline font-bold inline-flex items-center gap-1"
                >
                  Configure Payment Credentials in MCP Hub
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>
            </div>

          </section>

          {/* Section 4: Unified Transaction Reports Ledger */}
          <section className="p-5 rounded-2xl bg-surface border border-outline-variant shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-3">
              <div>
                <h3 className="font-title-md font-bold text-on-surface m-0 flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400 text-xl">receipt_long</span>
                  Unified Payment Ledger & Reports
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Synchronized transactions across all active merchant accounts ({filteredTransactions.length} records)
                </p>
              </div>

              {/* Table Search & Filter Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search Input */}
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-[16px]">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search customer, ID, or desc..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-surface-container-low border border-outline rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary w-52 shadow-xs"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-on-surface-variant hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-surface-container-low border border-outline rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary shadow-xs font-medium"
                >
                  <option value="all">All Statuses</option>
                  <option value="succeeded">Succeeded</option>
                  <option value="refunded">Refunded</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="overflow-x-auto rounded-xl border border-outline-variant">
              <table className="w-full text-left text-xs text-on-surface border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <th className="py-3 px-4">Gateway</th>
                    <th className="py-3 px-4">Transaction ID</th>
                    <th className="py-3 px-4">Customer & Reference</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Gross Amount</th>
                    <th className="py-3 px-4 text-right">Net Received</th>
                    <th className="py-3 px-4 text-right">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60">
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((tx) => {
                      const isStripe = tx.provider === 'stripe';
                      const isRefund = tx.type === 'refund' || tx.status === 'refunded';

                      return (
                        <tr
                          key={tx.id}
                          className="hover:bg-surface-container-low/80 transition-colors"
                        >
                          {/* Gateway Badge */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-2xs ${
                                isStripe ? 'bg-[#635bff]' : 'bg-[#4f46e5]'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {isStripe ? 'credit_card' : 'payments'}
                              </span>
                              {isStripe ? 'Stripe' : 'SafePay'}
                            </span>
                          </td>

                          {/* Transaction ID */}
                          <td className="py-3 px-4 font-mono text-[11px] text-on-surface font-semibold whitespace-nowrap">
                            {tx.id}
                          </td>

                          {/* Customer Name & Description */}
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-bold text-on-surface truncate">
                              {tx.customer_name || 'Enterprise Customer'}
                            </div>
                            <div className="text-[11px] text-on-surface-variant truncate">
                              {tx.description || tx.customer_email}
                            </div>
                          </td>

                          {/* Type */}
                          <td className="py-3 px-4 uppercase text-[10px] font-bold text-on-surface-variant whitespace-nowrap">
                            {tx.type || 'Charge'}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                tx.status === 'succeeded'
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                                  : tx.status === 'refunded'
                                  ? 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                                  : 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>

                          {/* Gross Amount */}
                          <td className="py-3 px-4 text-right font-bold whitespace-nowrap">
                            {isStripe ? (
                              <span className={isRefund ? 'text-rose-400' : 'text-on-surface'}>
                                {isRefund ? '-' : '+'}{formatCurrencyUSD(tx.amount)}
                              </span>
                            ) : (
                              <span className={isRefund ? 'text-rose-400' : 'text-on-surface'}>
                                {isRefund ? '-' : '+'}{formatCurrencyPKR(tx.amount)}
                              </span>
                            )}
                          </td>

                          {/* Net Received */}
                          <td className="py-3 px-4 text-right font-extrabold whitespace-nowrap">
                            {isStripe ? (
                              <span className={isRefund ? 'text-rose-400' : 'text-emerald-400'}>
                                {isRefund ? '-' : '+'}{formatCurrencyUSD(tx.net || tx.amount)}
                              </span>
                            ) : (
                              <span className={isRefund ? 'text-rose-400' : 'text-emerald-400'}>
                                {isRefund ? '-' : '+'}{formatCurrencyPKR(tx.net || tx.amount * 0.975)}
                              </span>
                            )}
                          </td>

                          {/* Date */}
                          <td className="py-3 px-4 text-right text-on-surface-variant text-[11px] whitespace-nowrap">
                            {formatDate(tx.created_at)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-on-surface-variant italic text-xs">
                        No transactions matched the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </main>
      </div>
    </AuthGuard>
  );
}
