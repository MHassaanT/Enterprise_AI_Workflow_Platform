'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

export default function FinanceDashboard() {
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [activeTab, setActiveTab] = useState('invoices');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  // Invoice creation state
  const [invNum, setInvNum] = useState(`INV-${Math.floor(1000 + Math.random() * 9000)}`);
  const [poNum, setPoNum] = useState('PO-2026-1001');
  const [vendorName, setVendorName] = useState('Global Tech Systems');
  const [vendorEmail, setVendorEmail] = useState('billing@globaltech.com');
  const [amount, setAmount] = useState('12500.00');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invRes, ledRes, budRes] = await Promise.all([
        fetch('/api/v1/finance/invoices').then((r) => r.json()).catch(() => ({ invoices: [] })),
        fetch('/api/v1/finance/ledger').then((r) => r.json()).catch(() => ({ ledger: [] })),
        fetch('/api/v1/finance/budgets').then((r) => r.json()).catch(() => ({ budgets: [] })),
      ]);
      setInvoices(invRes.invoices || []);
      setLedger(ledRes.ledger || []);
      setBudgets(budRes.budgets || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessInvoice = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/finance/process-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_data: {
            invoice_number: invNum,
            po_number: poNum,
            vendor_name: vendorName,
            vendor_email: vendorEmail,
            total_amount: parseFloat(amount),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${data.result.answer}`);
        setInvNum(`INV-${Math.floor(1000 + Math.random() * 9000)}`);
        fetchData();
      } else {
        setMessage(`❌ Processing failed: ${data.error}`);
      }
    } catch (err) {
      setMessage(`❌ Network error: ${err.message}`);
    } finally {
      setProcessing(false);
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
                <span className="material-symbols-outlined text-primary">payments</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">Finance Multi-Agent Hub</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Invoice Ingestion, RAG Reconciliation & General Ledger</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} className="px-md py-sm bg-surface-variant hover:bg-outline-variant rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh Data
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 flex overflow-hidden p-lg gap-lg">
          {/* Left Form Panel */}
          <div className="w-1/3 bg-surface border border-outline-variant rounded-lg p-md flex flex-col gap-md overflow-y-auto">
            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">cloud_upload</span> Process Invoice (Multi-Agent Flow)
            </h2>
            <p className="font-body-sm text-on-surface-variant">
              Submit invoice details to trigger <strong>Invoice Ingestion & Parsing Sub-Agent</strong> and <strong>Reconciliation & Audit Sub-Agent</strong>.
            </p>

            {message && (
              <div className="p-sm bg-surface-variant border border-outline rounded-md text-body-sm">
                {message}
              </div>
            )}

            <form onSubmit={handleProcessInvoice} className="flex flex-col gap-sm">
              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Invoice Number</label>
                <input
                  type="text"
                  value={invNum}
                  onChange={(e) => setInvNum(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
              </div>

              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Associated PO Number</label>
                <input
                  type="text"
                  value={poNum}
                  onChange={(e) => setPoNum(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
              </div>

              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Vendor Name</label>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
              </div>

              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Vendor Email</label>
                <input
                  type="email"
                  value={vendorEmail}
                  onChange={(e) => setVendorEmail(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
              </div>

              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Invoice Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={processing}
                className="mt-sm w-full py-md bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded-md transition-colors flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> Sub-Agents Analyzing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">send</span> Run Reconciliation Sub-Agents
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
                onClick={() => setActiveTab('invoices')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors ${
                  activeTab === 'invoices' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Invoices Registry
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors ${
                  activeTab === 'ledger' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                General Ledger
              </button>
              <button
                onClick={() => setActiveTab('budgets')}
                className={`py-sm px-md font-title-sm border-b-2 transition-colors ${
                  activeTab === 'budgets' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Department Budgets
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'invoices' && (
                <div className="flex flex-col gap-sm">
                  {invoices.length === 0 ? (
                    <p className="text-on-surface-variant font-body-sm italic p-md text-center">No invoice records found in database.</p>
                  ) : (
                    <table className="w-full text-left border-collapse text-body-sm">
                      <thead>
                        <tr className="border-b border-outline-variant text-on-surface-variant font-label-md">
                          <th className="p-sm">Invoice #</th>
                          <th className="p-sm">Vendor</th>
                          <th className="p-sm">Amount</th>
                          <th className="p-sm">Match Status</th>
                          <th className="p-sm">PO Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv, idx) => (
                          <tr key={idx} className="border-b border-outline-variant/50 hover:bg-surface-variant/30">
                            <td className="p-sm font-bold">{inv.invoice_number}</td>
                            <td className="p-sm">{inv.vendor_name}</td>
                            <td className="p-sm">${parseFloat(inv.total_amount || 0).toLocaleString()}</td>
                            <td className="p-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                inv.match_status === 'RECONCILED' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
                              }`}>
                                {inv.match_status}
                              </span>
                            </td>
                            <td className="p-sm text-on-surface-variant">{inv.po_number || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'ledger' && (
                <div className="flex flex-col gap-sm">
                  {ledger.length === 0 ? (
                    <p className="text-on-surface-variant font-body-sm italic p-md text-center">No general ledger entries recorded.</p>
                  ) : (
                    <table className="w-full text-left border-collapse text-body-sm">
                      <thead>
                        <tr className="border-b border-outline-variant text-on-surface-variant font-label-md">
                          <th className="p-sm">Account</th>
                          <th className="p-sm">Type</th>
                          <th className="p-sm">Forecast Revenue</th>
                          <th className="p-sm">Actual Expense</th>
                          <th className="p-sm">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((item, idx) => (
                          <tr key={idx} className="border-b border-outline-variant/50 hover:bg-surface-variant/30">
                            <td className="p-sm font-bold">{item.account_code} - {item.account_name}</td>
                            <td className="p-sm">{item.transaction_type}</td>
                            <td className="p-sm text-green-400">${parseFloat(item.forecasted_revenue || 0).toLocaleString()}</td>
                            <td className="p-sm text-red-400">${parseFloat(item.actual_expense || 0).toLocaleString()}</td>
                            <td className="p-sm text-on-surface-variant">{new Date(item.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'budgets' && (
                <div className="grid grid-cols-2 gap-md p-sm">
                  {budgets.length === 0 ? (
                    <p className="text-on-surface-variant font-body-sm italic col-span-2 text-center">No department budgets initialized.</p>
                  ) : (
                    budgets.map((b, idx) => (
                      <div key={idx} className="p-md bg-surface-variant/30 border border-outline-variant rounded-md flex flex-col gap-xs">
                        <h3 className="font-title-md text-primary">{b.department} Department</h3>
                        <p className="text-body-sm text-on-surface-variant">Total Budget: <strong>${parseFloat(b.total_budget || 0).toLocaleString()}</strong></p>
                        <p className="text-body-sm text-on-surface-variant">Spent: <strong>${parseFloat(b.spent_amount || 0).toLocaleString()}</strong></p>
                        <p className="text-body-sm text-on-surface-variant">Reserved: <strong>${parseFloat(b.reserved_amount || 0).toLocaleString()}</strong></p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
