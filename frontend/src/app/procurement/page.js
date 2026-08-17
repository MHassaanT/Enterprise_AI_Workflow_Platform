'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

export default function ProcurementDashboard() {
  const [bids, setBids] = useState([]);
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  // Bid form state
  const [bidRef, setBidRef] = useState(`BID-${Math.floor(1000 + Math.random() * 9000)}`);
  const [vendorName, setVendorName] = useState('Acme Hardware Solutions');
  const [vendorEmail, setVendorEmail] = useState('sales@acmehardware.com');
  const [amount, setAmount] = useState('45000.00');
  const [department, setDepartment] = useState('Engineering');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bidRes, poRes] = await Promise.all([
        fetch('/api/v1/procurement/bids').then((r) => r.json()).catch(() => ({ bids: [] })),
        fetch('/api/v1/procurement/purchase-orders').then((r) => r.json()).catch(() => ({ purchase_orders: [] })),
      ]);
      setBids(bidRes.bids || []);
      setPos(poRes.purchase_orders || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitBid = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/procurement/submit-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department,
          bid_data: {
            bid_reference: bidRef,
            vendor_name: vendorName,
            vendor_email: vendorEmail,
            quote_amount: parseFloat(amount),
            equipment_details: { spec: 'High-Performance Workstations', qty: 10 },
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${data.result.answer}`);
        setBidRef(`BID-${Math.floor(1000 + Math.random() * 9000)}`);
        fetchData();
      } else {
        setMessage(`❌ Submission failed: ${data.error}`);
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
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary">shopping_cart</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">Procurement Multi-Agent Hub</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Vendor Bid Ingestion, RAG Compliance & Cross-Agent Budget Verification</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} className="px-md py-sm bg-surface-variant hover:bg-outline-variant rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh Data
            </button>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 flex overflow-hidden p-lg gap-lg">
          {/* Left Form */}
          <div className="w-1/3 bg-surface border border-outline-variant rounded-lg p-md flex flex-col gap-md overflow-y-auto">
            <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">assignment_add</span> Submit Vendor Bid
            </h2>
            <p className="font-body-sm text-on-surface-variant">
              Runs <strong>Vendor Bid Ingestion Sub-Agent</strong>, <strong>Budget Verification Sub-Agent</strong> (via Finance Agent), and generates PO Approval Request.
            </p>

            {message && (
              <div className="p-sm bg-surface-variant border border-outline rounded-md text-body-sm">
                {message}
              </div>
            )}

            <form onSubmit={handleSubmitBid} className="flex flex-col gap-sm">
              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Bid Reference</label>
                <input
                  type="text"
                  value={bidRef}
                  onChange={(e) => setBidRef(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                  required
                />
              </div>

              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full mt-1 p-sm bg-background border border-outline rounded-md text-on-surface font-body-sm"
                >
                  <option value="Engineering">Engineering</option>
                  <option value="Sales">Sales</option>
                  <option value="Operations">Operations</option>
                </select>
              </div>

              <div>
                <label className="text-body-sm text-on-surface-variant font-label-md">Vendor Company Name</label>
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
                <label className="text-body-sm text-on-surface-variant font-label-md">Quote Amount ($)</label>
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
                className="mt-sm w-full py-md bg-secondary hover:bg-secondary/90 text-on-secondary font-label-md rounded-md transition-colors flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> Verifying Budget & RAG Compliance...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">rule</span> Submit & Request Budget Clearance
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Tables */}
          <div className="flex-1 bg-surface border border-outline-variant rounded-lg p-md flex flex-col overflow-hidden">
            <h2 className="font-title-md text-title-md text-on-surface mb-md">Vendor Bids & Executed Purchase Orders</h2>
            
            <div className="flex-1 overflow-y-auto flex flex-col gap-md">
              <div>
                <h3 className="font-title-sm text-secondary mb-xs">Active Vendor Bids</h3>
                {bids.length === 0 ? (
                  <p className="text-on-surface-variant font-body-sm italic p-sm">No bids submitted yet.</p>
                ) : (
                  <table className="w-full text-left border-collapse text-body-sm">
                    <thead>
                      <tr className="border-b border-outline-variant text-on-surface-variant font-label-md">
                        <th className="p-sm">Bid Ref</th>
                        <th className="p-sm">Vendor</th>
                        <th className="p-sm">Amount</th>
                        <th className="p-sm">RAG Compliance</th>
                        <th className="p-sm">Budget Clearance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bids.map((b, idx) => (
                        <tr key={idx} className="border-b border-outline-variant/50 hover:bg-surface-variant/30">
                          <td className="p-sm font-bold">{b.bid_reference}</td>
                          <td className="p-sm">{b.vendor_name}</td>
                          <td className="p-sm">${parseFloat(b.quote_amount || 0).toLocaleString()}</td>
                          <td className="p-sm">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              b.compliance_status === 'COMPLIANT' ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/40 text-yellow-300'
                            }`}>
                              {b.compliance_status}
                            </span>
                          </td>
                          <td className="p-sm text-on-surface-variant">{b.budget_clearance_status || 'APPROVED'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <h3 className="font-title-sm text-primary mb-xs">Executed Purchase Orders</h3>
                {pos.length === 0 ? (
                  <p className="text-on-surface-variant font-body-sm italic p-sm">No Purchase Orders executed yet.</p>
                ) : (
                  <table className="w-full text-left border-collapse text-body-sm">
                    <thead>
                      <tr className="border-b border-outline-variant text-on-surface-variant font-label-md">
                        <th className="p-sm">PO Number</th>
                        <th className="p-sm">Vendor</th>
                        <th className="p-sm">Amount</th>
                        <th className="p-sm">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pos.map((po, idx) => (
                        <tr key={idx} className="border-b border-outline-variant/50 hover:bg-surface-variant/30">
                          <td className="p-sm font-bold">{po.po_number}</td>
                          <td className="p-sm">{po.vendor_name}</td>
                          <td className="p-sm">${parseFloat(po.amount || 0).toLocaleString()}</td>
                          <td className="p-sm text-green-400 font-bold">{po.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
