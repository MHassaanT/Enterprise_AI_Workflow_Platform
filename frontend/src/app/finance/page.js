"use client";

import React, { useState, useEffect } from 'react';
import './finance.css';

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
      // First check if budgets are setup
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

  if (loading) return <div className="finance-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}><h2>Loading Finance Intelligence...</h2></div>;

  return (
    <div className="finance-container">
      {needsSetup && (
        <div className="setup-overlay">
          <div className="setup-card">
            <h2>Initialize Budgets</h2>
            <p>Set up the initial operating budgets for your enterprise departments.</p>
            {budgets.map((b, i) => (
              <div className="budget-input-group" key={b.department}>
                <label>{b.department} Budget</label>
                <div className="budget-input-wrapper">
                  <span className="currency-symbol">$</span>
                  <input 
                    type="number" 
                    className="budget-input"
                    placeholder="0.00"
                    value={b.budget_amount}
                    onChange={(e) => handleBudgetChange(i, e.target.value)}
                  />
                </div>
              </div>
            ))}
            <button className="submit-btn" onClick={submitBudgets}>Save Configuration</button>
          </div>
        </div>
      )}

      <div className="finance-content">
        <header className="finance-header">
          <h1>Finance Intelligence</h1>
          <p>Real-time corporate treasury, revenue, and expense tracking</p>
        </header>

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-title">Total Allocated Budget</div>
            <div className="metric-value">{formatCurrency(metrics.totalBudget)}</div>
          </div>
          <div className="metric-card positive">
            <div className="metric-title">Earned This Month (Sales)</div>
            <div className="metric-value">+{formatCurrency(metrics.earned)}</div>
          </div>
          <div className="metric-card negative">
            <div className="metric-title">Total Expense Reserves (Procurement)</div>
            <div className="metric-value">-{formatCurrency(metrics.spent)}</div>
          </div>
        </div>

        <div className="dashboard-sections">
          <div className="section-card">
            <h3 className="section-title">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#4ade80'}}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
              Recent Revenue (Sales)
            </h3>
            {reports.sales.length > 0 ? (
              reports.sales.map((item, idx) => (
                <div className="list-item" key={item.id || idx}>
                  <div className="item-info">
                    <span className="item-name">{item.description || item.reference_id || 'Closed Sale'}</span>
                    <span className="item-date">{formatDate(item.created_at)}</span>
                  </div>
                  <div className="item-amount amount-positive">
                    +{formatCurrency(item.amount)}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No recent sales revenue recorded.</div>
            )}
          </div>

          <div className="section-card">
            <h3 className="section-title">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#f87171'}}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>
              Recent Expenses (Procurement)
            </h3>
            {reports.procurement.length > 0 ? (
              reports.procurement.map((item, idx) => (
                <div className="list-item" key={item.id || idx}>
                  <div className="item-info">
                    <span className="item-name">{item.description || `PO: ${item.reference_id}`}</span>
                    <span className="item-date">{formatDate(item.created_at)}</span>
                  </div>
                  <div className="item-amount amount-negative">
                    -{formatCurrency(item.amount)}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No recent procurement expenses recorded.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
