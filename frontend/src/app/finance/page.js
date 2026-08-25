"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

export default function FinanceDashboard() {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [budgets, setBudgets] = useState([
    { department: 'Marketing', budget_amount: '' },
    { department: 'Sales', budget_amount: '' },
    { department: 'Operations', budget_amount: '' },
    { department: 'IT', budget_amount: '' },
    { department: 'HR', budget_amount: '' }
  ]);
  const [metrics, setMetrics] = useState({ totalBudget: 0, earned: 0, spent: 0 });
  const [reports, setReports] = useState({ sales: [], procurement: [] });
  const API_BASE = '/api/v1/finance';

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const bRes = await fetch(`${API_BASE}/budgets`);
      const bData = await bRes.json();
      
      if (bData.success && bData.budgets && bData.budgets.length > 0) {
        setNeedsSetup(false);
      } else {
        setNeedsSetup(true);
      }

      const dRes = await fetch(`${API_BASE}/dashboard`);
      const dData = await dRes.json();
      
      if (dData.success) {
        setMetrics(dData.metrics);
        setReports(dData.reports);
      }
    } catch (err) {
      console.error('Error fetching finance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBudgetChange = (index, value) => {
    const newBudgets = [...budgets];
    newBudgets[index].budget_amount = value;
    setBudgets(newBudgets);
  };

  const submitBudgets = async () => {
    try {
      const payload = budgets.map(b => ({
        department: b.department,
        budget_amount: parseFloat(b.budget_amount) || 0
      }));
      const res = await fetch(`${API_BASE}/budgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgets: payload })
      });
      const data = await res.json();
      if (data.success) {
        setNeedsSetup(false);
        fetchDashboard();
      }
    } catch (err) {
      console.error('Error saving budgets:', err);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background text-on-surface flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
            <h2 className="text-xl font-bold">Loading Finance Intelligence...</h2>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md flex flex-col h-screen overflow-hidden relative">
        
        {/* Setup Overlay */}
        {needsSetup && (
          <div className="absolute inset-0 bg-background/90 backdrop-blur-sm z-50 flex justify-center items-center">
            <div className="bg-surface border border-outline-variant rounded-xl p-8 w-full max-w-lg shadow-lg">
              <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2 text-center">Initialize Budgets</h2>
              <p className="text-body-sm text-on-surface-variant mb-6 text-center">Set up the initial operating budgets for your enterprise departments.</p>
              
              <div className="flex flex-col gap-4 mb-6">
                {budgets.map((b, i) => (
                  <div key={b.department}>
                    <label className="text-body-sm text-on-surface-variant font-label-md block mb-1">{b.department} Budget</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-on-surface-variant font-bold">$</span>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        value={b.budget_amount}
                        onChange={(e) => handleBudgetChange(i, e.target.value)}
                        className="w-full py-2 pl-8 pr-3 bg-background border border-outline rounded-md text-on-surface font-body-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={submitBudgets}
                className="w-full py-3 bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded-md transition-colors shadow flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">save</span> Save Configuration
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="border-b border-outline-variant bg-surface px-lg py-md flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors flex items-center">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shadow">
                <span className="material-symbols-outlined text-primary text-[22px]">account_balance</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">Finance Agent</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Real-time corporate treasury, revenue, and expense tracking</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDashboard}
              className="px-md py-sm bg-surface-variant hover:bg-outline-variant rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh
            </button>
          </div>
        </header>

        {/* Dashboard Analytics Stats Bar */}
        <section className="bg-surface/80 border-b border-outline-variant/60 px-lg py-md flex-shrink-0 grid grid-cols-1 md:grid-cols-3 gap-md">
          <div className="bg-background border border-outline-variant rounded-lg p-sm flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-on-surface-variant font-label-md block uppercase tracking-wider">Total Allocated Budget</span>
              <span className="text-2xl font-bold text-on-surface">{formatCurrency(metrics.totalBudget)}</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-900/30 text-blue-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
            </div>
          </div>

          <div className="bg-background border border-outline-variant rounded-lg p-sm flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-on-surface-variant font-label-md block uppercase tracking-wider">Earned This Month (Sales)</span>
              <span className="text-2xl font-bold text-emerald-400">+{formatCurrency(metrics.earned)}</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-900/30 text-emerald-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">trending_up</span>
            </div>
          </div>

          <div className="bg-background border border-outline-variant rounded-lg p-sm flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-on-surface-variant font-label-md block uppercase tracking-wider">Expense Reserves (Procurement)</span>
              <span className="text-2xl font-bold text-error">-{formatCurrency(metrics.spent)}</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-error-container/30 text-error flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">trending_down</span>
            </div>
          </div>
        </section>

        {/* Main Content Body */}
        <main className="flex-1 overflow-auto p-lg gap-lg grid grid-cols-1 md:grid-cols-2">
          
          {/* Sales Revenue Section */}
          <div className="bg-surface border border-outline-variant rounded-lg p-md flex flex-col overflow-hidden h-fit">
            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2 m-0 border-b border-outline-variant pb-sm mb-sm">
              <span className="material-symbols-outlined text-emerald-400">payments</span> Recent Revenue (Sales)
            </h2>
            
            <div className="flex flex-col gap-2">
              {reports.sales.length > 0 ? (
                reports.sales.map((item, idx) => (
                  <div className="p-sm bg-background border border-outline-variant rounded-md flex justify-between items-center hover:border-outline transition-colors" key={item.id || idx}>
                    <div className="flex flex-col">
                      <span className="font-label-md text-on-surface">{item.description || item.reference_id || 'Closed Sale'}</span>
                      <span className="text-xs text-on-surface-variant">{formatDate(item.created_at)}</span>
                    </div>
                    <div className="font-bold text-emerald-400">
                      +{formatCurrency(item.amount)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center p-md text-on-surface-variant italic text-sm">
                  No recent sales revenue recorded.
                </div>
              )}
            </div>
          </div>

          {/* Procurement Expenses Section */}
          <div className="bg-surface border border-outline-variant rounded-lg p-md flex flex-col overflow-hidden h-fit">
            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2 m-0 border-b border-outline-variant pb-sm mb-sm">
              <span className="material-symbols-outlined text-error">receipt_long</span> Recent Expenses (Procurement)
            </h2>
            
            <div className="flex flex-col gap-2">
              {reports.procurement.length > 0 ? (
                reports.procurement.map((item, idx) => (
                  <div className="p-sm bg-background border border-outline-variant rounded-md flex justify-between items-center hover:border-outline transition-colors" key={item.id || idx}>
                    <div className="flex flex-col">
                      <span className="font-label-md text-on-surface">{item.description || `PO: ${item.reference_id}`}</span>
                      <span className="text-xs text-on-surface-variant">{formatDate(item.created_at)}</span>
                    </div>
                    <div className="font-bold text-error">
                      -{formatCurrency(item.amount)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center p-md text-on-surface-variant italic text-sm">
                  No recent procurement expenses recorded.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
