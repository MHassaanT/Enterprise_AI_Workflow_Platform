'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

export default function UniversalApprovalsDashboard() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/approvals');
      const data = await res.json();
      setApprovals(data.approvals || data.pending_approvals || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (id, decision) => {
    setActingId(id);
    setMessage('');
    try {
      const res = await fetch(`/api/v1/approvals/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        setMessage(`✅ Approval ID ${id} set to '${decision.toUpperCase()}'. Sub-agent resumed.`);
        fetchApprovals();
      } else {
        setMessage(`❌ Action failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`❌ Network error: ${err.message}`);
    } finally {
      setActingId(null);
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
              <div className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center">
                <span className="material-symbols-outlined text-error">gavel</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">Universal Human Approvals Dashboard</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Human-in-the-loop Gatekeeper for Finance & Sales Multi-Agents</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchApprovals} className="px-md py-sm bg-surface-variant hover:bg-outline-variant rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh Requests
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-lg overflow-y-auto flex flex-col gap-md">
          {message && (
            <div className="p-md bg-surface-variant border border-outline rounded-md text-body-sm">
              {message}
            </div>
          )}

          <div className="bg-surface border border-outline-variant rounded-lg p-md flex flex-col gap-md">
            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-error">verified_user</span> Pending Human Approval Requests
            </h2>

            {loading ? (
              <p className="text-on-surface-variant font-body-sm italic p-md">Loading pending approvals...</p>
            ) : approvals.length === 0 ? (
              <div className="p-xl text-center border border-dashed border-outline-variant rounded-md">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-sm">task_alt</span>
                <p className="font-title-md text-on-surface">No Pending Approval Requests</p>
                <p className="font-body-sm text-on-surface-variant">All multi-agent operations have completed or are cleared.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-md">
                {approvals.map((item) => {
                  const details = typeof item.details === 'string' ? JSON.parse(item.details) : item.details || {};
                  return (
                    <div key={item.id} className="p-md bg-surface-variant/40 border border-outline-variant rounded-lg flex flex-col gap-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-primary-container text-primary">
                            {item.action_type || 'APPROVAL_ACTION'}
                          </span>
                          <span className="text-body-sm font-bold text-on-surface">ID: {item.id}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          item.status === 'pending' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-green-900/40 text-green-300'
                        }`}>
                          {item.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-md text-body-sm my-xs bg-background/50 p-sm rounded border border-outline-variant/40">
                        <div>
                          <span className="text-on-surface-variant font-label-md block">Requester Sub-Agent</span>
                          <span className="font-bold text-primary">{item.requester_id || 'Sub-Agent'}</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-label-md block">Amount / Reference</span>
                          <span className="font-bold">
                            {details.amount ? `$${parseFloat(details.amount).toLocaleString()}` : details.bid_reference || details.invoice_number || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-label-md block">Vendor / Customer</span>
                          <span className="font-bold">{details.vendor_name || details.vendor_email || details.customer_email || 'N/A'}</span>
                        </div>
                      </div>

                      {item.status === 'pending' && (
                        <div className="flex items-center justify-end gap-md mt-xs">
                          <button
                            onClick={() => handleDecision(item.id, 'rejected')}
                            disabled={actingId === item.id}
                            className="px-md py-sm bg-error/20 hover:bg-error/30 text-error font-label-md rounded-md transition-colors flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span> Reject Action
                          </button>
                          <button
                            onClick={() => handleDecision(item.id, 'approved')}
                            disabled={actingId === item.id}
                            className="px-md py-sm bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded-md transition-colors flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[18px]">check</span> Approve & Execute Sub-Agent
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
