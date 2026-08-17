'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

export default function SalesDashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  // Form state
  const [custEmail, setCustEmail] = useState('enterprise_client@acmecorp.com');
  const [tier, setTier] = useState('Enterprise');
  const [discount, setDiscount] = useState('12.0');

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/sales/leads');
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestQuote = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/sales/request-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_email: custEmail,
          tier_requested: tier,
          requested_discount: parseFloat(discount),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${data.result.answer}`);
        fetchLeads();
      } else {
        setMessage(`❌ Quote generation failed: ${data.error}`);
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
              <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-tertiary">trending_up</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">Sales Multi-Agent Hub</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Lead Ingestion, RAG Quote Calculator & Cross-Agent Financial Sync</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchLeads} className="px-md py-sm bg-surface-variant hover:bg-outline-variant rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh Leads
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 flex overflow-hidden p-lg gap-lg">
          {/* Form */}
          <div className="w-1/3 bg-surface border border-outline-variant rounded-lg p-md flex flex-col gap-md overflow-y-auto">
            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary">request_quote</span> Request Pricing & Draft Quote
            </h2>
            <p className="font-body-sm text-on-surface-variant">
              Triggers <strong>Lead & Pricing Sub-Agent</strong> (enforces max 15% discount limit), <strong>Deal Negotiation Sub-Agent</strong>, and <strong>Financial Sync Sub-Agent</strong>.
            </p>

            {message && (
              <div className="p-sm bg-surface-variant border border-outline rounded-md text-body-sm">
                {message}
              </div>
            )}

            <form onSubmit={handleRequestQuote} className="flex flex-col gap-sm">
              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Customer Email</label>
                <input
                  type="email"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
              </div>

              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Tier Requested</label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                >
                  <option value="Enterprise">Enterprise ($100k base)</option>
                  <option value="Professional">Professional ($50k base)</option>
                </select>
              </div>

              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Requested Discount (%) [Max 15% Enforced]</label>
                <input
                  type="number"
                  step="0.1"
                  max="50"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={processing}
                className="mt-sm w-full py-md bg-tertiary hover:bg-tertiary/90 text-on-tertiary font-label-md rounded-md transition-colors flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> Sub-Agents Calculating...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">calculate</span> Calculate & Draft Quote
                  </>
                )}
              </button>
            </form>
          </div>

          {/* CRM Leads Table */}
          <div className="flex-1 bg-surface border border-outline-variant rounded-lg p-md flex flex-col overflow-hidden">
            <h2 className="font-title-md text-title-md text-on-surface mb-md">CRM Lead Pipeline & Deal Stages</h2>
            
            <div className="flex-1 overflow-y-auto">
              {leads.length === 0 ? (
                <p className="text-on-surface-variant font-body-sm italic p-md text-center">No CRM lead records found.</p>
              ) : (
                <table className="w-full text-left border-collapse text-body-sm">
                  <thead>
                    <tr className="border-b border-outline-variant text-on-surface-variant font-label-md">
                      <th className="p-sm">Lead ID</th>
                      <th className="p-sm">Customer</th>
                      <th className="p-sm">Company</th>
                      <th className="p-sm">Deal Stage</th>
                      <th className="p-sm">Discount Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l, idx) => (
                      <tr key={idx} className="border-b border-outline-variant/50 hover:bg-surface-variant/30">
                        <td className="p-sm font-bold">{l.lead_id}</td>
                        <td className="p-sm">{l.customer_email}</td>
                        <td className="p-sm">{l.company || 'Enterprise Corp'}</td>
                        <td className="p-sm">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            l.deal_stage === 'Closed Won' ? 'bg-green-900/40 text-green-300' : 'bg-blue-900/40 text-blue-300'
                          }`}>
                            {l.deal_stage}
                          </span>
                        </td>
                        <td className="p-sm">{l.discount_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
