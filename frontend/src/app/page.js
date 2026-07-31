'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from './components/Header';
import AuthGuard from './components/AuthGuard';
import ApprovalCard from './components/ApprovalCard';
import { fetchConversations, fetchPendingApprovals, fetchDocuments, patchApproval, getUser } from '@/lib/api';

export default function TenantControlPanelPage() {
  const [conversations, setConversations] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getUser());
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [convs, approvals, docs] = await Promise.all([
        fetchConversations().catch(() => []),
        fetchPendingApprovals().catch(() => []),
        fetchDocuments().catch(() => [])
      ]);
      setConversations(convs);
      setPendingApprovals(approvals);
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading control panel overview', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalDecision = async (approvalId, decision) => {
    try {
      await patchApproval(approvalId, decision);
      setPendingApprovals((prev) => prev.filter((app) => app.id !== approvalId));
    } catch (err) {
      alert('Failed to submit decision: ' + err.message);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthGuard>
      <div className="portal-wrapper">
        <Header />

        <main className="portal-main">
          {/* Welcome Banner */}
          <div className="welcome-banner">
            <div>
              <div className="badge-row">
                <span className="tenant-tag">⚡ Tenant Control Panel</span>
                {user?.role && (
                  <span className={`role-pill ${isAdmin ? 'role-admin' : 'role-reviewer'}`}>
                    Role: {user.role}
                  </span>
                )}
              </div>
              <h1 className="welcome-title">Enterprise AI Workforce Dashboard</h1>
              <p className="welcome-desc">
                Centralized management for customer support agent conversations, human approval queues, vector knowledge bases, and embeddable widget deployments.
              </p>
            </div>
            <Link href="/widget-setup" className="deploy-widget-btn">
              🧩 Deploy Web Widget ➔
            </Link>
          </div>

          {/* Metrics Grid */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon">💬</div>
              <div className="metric-details">
                <span className="metric-val">{conversations.length}</span>
                <span className="metric-lbl">Customer Conversations</span>
              </div>
              <Link href="/chat" className="metric-link">
                View Chat Histories ➔
              </Link>
            </div>

            <div className="metric-card">
              <div className="metric-icon">⚖️</div>
              <div className="metric-details">
                <span className="metric-val">{pendingApprovals.length}</span>
                <span className="metric-lbl">Pending Approvals</span>
              </div>
              <span className="metric-tag">Human-in-the-Loop</span>
            </div>

            <div className="metric-card">
              <div className="metric-icon">📄</div>
              <div className="metric-details">
                <span className="metric-val">{documents.length}</span>
                <span className="metric-lbl">Indexed Knowledge Docs</span>
              </div>
              <span className="metric-tag">Vector Retrieval (RAG)</span>
            </div>
          </div>

          {/* Main Dashboard Layout */}
          <div className="dashboard-grid">
            {/* Left Column: Human Approval Queue */}
            <div className="section-card">
              <div className="section-header">
                <div className="section-title">
                  <span className="section-icon">🛡️</span>
                  <div>
                    <h3>Human Approval Queue</h3>
                    <p className="section-sub">High-risk actions awaiting Reviewer / Admin authorization</p>
                  </div>
                </div>
                <span className="count-pill">{pendingApprovals.length} Pending</span>
              </div>

              {loading ? (
                <div className="state-box">Loading approval queue...</div>
              ) : pendingApprovals.length === 0 ? (
                <div className="state-box empty-state">
                  ✅ No pending approval requests. All agent tools are executing within safety parameters.
                </div>
              ) : (
                <div className="approvals-list">
                  {pendingApprovals.map((approval) => (
                    <ApprovalCard
                      key={approval.id}
                      approvalId={approval.id}
                      reason={approval.action_type}
                      actionType={approval.action_type}
                      actionPayload={approval.action_payload}
                      onDecision={handleApprovalDecision}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Quick Management & Setup */}
            <div className="side-column">
              {/* MCP Connections Card */}
              <div className="mini-card">
                <div className="mini-header">
                  <span className="mini-icon">🔌</span>
                  <h4>MCP Tools & Connectors</h4>
                </div>
                <p className="mini-desc">
                  Connect unlimited external MCP servers and configure per-agent tool allowlists.
                </p>
                <Link href="/mcp" className="mini-btn">
                  Manage MCP Tools ➔
                </Link>
              </div>

              {/* Widget Deployment Card */}
              <div className="mini-card">
                <div className="mini-header">
                  <span className="mini-icon">🧩</span>
                  <h4>Standalone Web Widget</h4>
                </div>
                <p className="mini-desc">
                  Embed the customer support widget into your website HTML with a single script tag.
                </p>
                <Link href="/widget-setup" className="mini-btn">
                  Get Widget Script ➔
                </Link>
              </div>

              {/* User Management Card (Admin Only) */}
              {isAdmin && (
                <div className="mini-card">
                  <div className="mini-header">
                    <span className="mini-icon">👥</span>
                    <h4>Reviewer Accounts</h4>
                  </div>
                  <p className="mini-desc">
                    Provision discrete login credentials for team members restricted to approval queue management.
                  </p>
                  <Link href="/users" className="mini-btn mini-btn-indigo">
                    Manage Team Users ➔
                  </Link>
                </div>
              )}

              {/* Knowledge Base Card */}
              <div className="mini-card">
                <div className="mini-header">
                  <span className="mini-icon">📁</span>
                  <h4>Knowledge Base (RAG)</h4>
                </div>
                <p className="mini-desc">
                  {isAdmin
                    ? 'Upload PDF and DOCX files to feed vector retrieval memory.'
                    : 'Read-only view of uploaded company knowledge docs.'}
                </p>
                <div className="doc-count-badge">
                  {documents.length} File(s) Indexed
                </div>
              </div>
            </div>
          </div>
        </main>

        <style jsx>{`
          .portal-wrapper {
            min-height: 100vh;
            background: #f8fafc;
          }
          .portal-main {
            max-width: 1350px;
            margin: 2rem auto;
            padding: 0 1.5rem;
          }
          .welcome-banner {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #ffffff;
            border-radius: 16px;
            padding: 2.25rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25);
            margin-bottom: 2rem;
          }
          .badge-row {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.5rem;
          }
          .tenant-tag {
            background: rgba(255, 255, 255, 0.1);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.3);
            padding: 0.25rem 0.65rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
          }
          .role-pill {
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            padding: 0.25rem 0.65rem;
            border-radius: 20px;
          }
          .role-admin {
            background: #818cf8;
            color: #1e1b4b;
          }
          .role-reviewer {
            background: #fde047;
            color: #713f12;
          }
          .welcome-title {
            font-size: 1.85rem;
            font-weight: 800;
            margin: 0 0 0.5rem 0;
            letter-spacing: -0.02em;
          }
          .welcome-desc {
            color: #94a3b8;
            margin: 0;
            max-width: 720px;
            font-size: 0.95rem;
            line-height: 1.5;
          }
          .deploy-widget-btn {
            background: #2563eb;
            color: #ffffff;
            text-decoration: none;
            padding: 0.85rem 1.4rem;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.9rem;
            box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
            transition: transform 0.2s, background 0.2s;
            white-space: nowrap;
          }
          .deploy-widget-btn:hover {
            background: #1d4ed8;
            transform: translateY(-2px);
          }
          .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5rem;
            margin-bottom: 2rem;
          }
          @media (max-width: 900px) {
            .metrics-grid {
              grid-template-columns: 1fr;
            }
          }
          .metric-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.02);
            position: relative;
          }
          .metric-icon {
            font-size: 1.75rem;
          }
          .metric-details {
            display: flex;
            flex-direction: column;
          }
          .metric-val {
            font-size: 2.25rem;
            font-weight: 800;
            color: #0f172a;
            line-height: 1;
          }
          .metric-lbl {
            font-size: 0.875rem;
            color: #64748b;
            font-weight: 600;
            margin-top: 0.35rem;
          }
          .metric-link {
            color: #2563eb;
            font-size: 0.85rem;
            font-weight: 600;
            text-decoration: none;
            margin-top: auto;
          }
          .metric-link:hover {
            text-decoration: underline;
          }
          .metric-tag {
            color: #64748b;
            font-size: 0.8rem;
            font-weight: 500;
            margin-top: auto;
          }
          .dashboard-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 1.75rem;
          }
          @media (max-width: 1024px) {
            .dashboard-grid {
              grid-template-columns: 1fr;
            }
          }
          .section-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 1.75rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.02);
          }
          .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1.5rem;
          }
          .section-title {
            display: flex;
            align-items: center;
            gap: 0.75rem;
          }
          .section-icon {
            font-size: 1.5rem;
          }
          .section-title h3 {
            margin: 0;
            font-size: 1.2rem;
            font-weight: 700;
            color: #0f172a;
          }
          .section-sub {
            margin: 0.2rem 0 0 0;
            font-size: 0.85rem;
            color: #64748b;
          }
          .count-pill {
            background: #fef3c7;
            color: #92400e;
            border: 1px solid #fde68a;
            padding: 0.3rem 0.75rem;
            border-radius: 20px;
            font-size: 0.825rem;
            font-weight: 700;
          }
          .approvals-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .state-box {
            padding: 2rem;
            text-align: center;
            color: #64748b;
            font-size: 0.9rem;
            background: #f8fafc;
            border-radius: 10px;
          }
          .empty-state {
            color: #166534;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            font-weight: 600;
          }
          .side-column {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
          }
          .mini-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 1.5rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.02);
            display: flex;
            flex-direction: column;
            gap: 0.65rem;
          }
          .mini-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .mini-icon {
            font-size: 1.25rem;
          }
          .mini-header h4 {
            margin: 0;
            font-size: 1.05rem;
            font-weight: 700;
            color: #0f172a;
          }
          .mini-desc {
            margin: 0;
            font-size: 0.85rem;
            color: #64748b;
            line-height: 1.45;
          }
          .mini-btn {
            display: inline-block;
            background: #2563eb;
            color: #ffffff;
            text-decoration: none;
            padding: 0.55rem 0.95rem;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.85rem;
            text-align: center;
            margin-top: 0.25rem;
            transition: background 0.2s;
          }
          .mini-btn:hover {
            background: #1d4ed8;
          }
          .mini-btn-indigo {
            background: #4f46e5;
          }
          .mini-btn-indigo:hover {
            background: #4338ca;
          }
          .doc-count-badge {
            background: #f1f5f9;
            color: #334155;
            padding: 0.45rem 0.75rem;
            border-radius: 6px;
            font-size: 0.825rem;
            font-weight: 600;
            text-align: center;
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
