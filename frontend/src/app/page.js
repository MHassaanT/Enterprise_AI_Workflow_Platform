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
            background: var(--color-bg);
          }
          .portal-main {
            max-width: 1200px;
            margin: 2rem auto;
            padding: 0 1.5rem;
            animation: fadeIn 0.4s ease-out;
          }
          .welcome-banner {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            color: var(--color-text);
            border-radius: var(--radius-lg);
            padding: 2rem 2.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: var(--shadow-sm);
            margin-bottom: 2rem;
          }
          .badge-row {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
          }
          .tenant-tag {
            background: var(--color-secondary);
            color: var(--color-muted);
            border: 1px solid var(--color-border);
            padding: 0.25rem 0.75rem;
            border-radius: var(--radius-sm);
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.02em;
          }
          .role-pill {
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            padding: 0.25rem 0.75rem;
            border-radius: var(--radius-sm);
          }
          .role-admin {
            background: #eef2ff;
            color: #4f46e5;
            border: 1px solid #c7d2fe;
          }
          .role-reviewer {
            background: #fefce8;
            color: #a16207;
            border: 1px solid #fef08a;
          }
          .welcome-title {
            font-size: 1.75rem;
            font-weight: 700;
            margin: 0 0 0.5rem 0;
            letter-spacing: -0.02em;
            color: var(--color-text);
          }
          .welcome-desc {
            color: var(--color-muted);
            margin: 0;
            max-width: 600px;
            font-size: 0.95rem;
            line-height: 1.5;
          }
          .deploy-widget-btn {
            background: var(--color-primary);
            color: #ffffff;
            text-decoration: none;
            padding: 0.75rem 1.25rem;
            border-radius: var(--radius);
            font-weight: 600;
            font-size: 0.875rem;
            transition: all 0.2s;
            white-space: nowrap;
            box-shadow: var(--shadow-sm);
          }
          .deploy-widget-btn:hover {
            background: var(--color-primary-hover);
            box-shadow: var(--shadow-md);
            transform: translateY(-1px);
          }
          .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.25rem;
            margin-bottom: 2rem;
          }
          @media (max-width: 900px) {
            .metrics-grid {
              grid-template-columns: 1fr;
            }
          }
          .metric-card {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            box-shadow: var(--shadow-card);
            position: relative;
            transition: box-shadow 0.2s, border-color 0.2s;
          }
          .metric-card:hover {
            box-shadow: var(--shadow-md);
            border-color: #d1d5db;
          }
          .metric-icon {
            font-size: 1.25rem;
            margin-bottom: 0.25rem;
          }
          .metric-details {
            display: flex;
            flex-direction: column;
          }
          .metric-val {
            font-size: 2rem;
            font-weight: 700;
            color: var(--color-text);
            line-height: 1.1;
            letter-spacing: -0.02em;
          }
          .metric-lbl {
            font-size: 0.85rem;
            color: var(--color-muted);
            font-weight: 500;
            margin-top: 0.25rem;
          }
          .metric-link {
            color: var(--color-accent);
            font-size: 0.85rem;
            font-weight: 500;
            text-decoration: none;
            margin-top: auto;
            padding-top: 1rem;
          }
          .metric-link:hover {
            text-decoration: underline;
          }
          .metric-tag {
            color: var(--color-muted);
            font-size: 0.8rem;
            font-weight: 500;
            margin-top: auto;
            padding-top: 1rem;
          }
          .dashboard-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 1.5rem;
          }
          @media (max-width: 1024px) {
            .dashboard-grid {
              grid-template-columns: 1fr;
            }
          }
          .section-card {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: 1.75rem;
            box-shadow: var(--shadow-card);
          }
          .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--color-border);
          }
          .section-title {
            display: flex;
            align-items: center;
            gap: 0.75rem;
          }
          .section-icon {
            font-size: 1.25rem;
          }
          .section-title h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--color-text);
          }
          .section-sub {
            margin: 0.2rem 0 0 0;
            font-size: 0.85rem;
            color: var(--color-muted);
          }
          .count-pill {
            background: #fefce8;
            color: #a16207;
            border: 1px solid #fef08a;
            padding: 0.25rem 0.6rem;
            border-radius: var(--radius-sm);
            font-size: 0.75rem;
            font-weight: 600;
          }
          .approvals-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }
          .state-box {
            padding: 2.5rem 2rem;
            text-align: center;
            color: var(--color-muted);
            font-size: 0.9rem;
            background: var(--color-bg);
            border-radius: var(--radius);
            border: 1px dashed var(--color-border);
          }
          .empty-state {
            color: #15803d;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-style: solid;
            font-weight: 500;
          }
          .side-column {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
          }
          .mini-card {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: 1.5rem;
            box-shadow: var(--shadow-card);
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            transition: box-shadow 0.2s, border-color 0.2s;
          }
          .mini-card:hover {
            box-shadow: var(--shadow-md);
            border-color: #d1d5db;
          }
          .mini-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .mini-icon {
            font-size: 1.1rem;
          }
          .mini-header h4 {
            margin: 0;
            font-size: 1rem;
            font-weight: 600;
            color: var(--color-text);
          }
          .mini-desc {
            margin: 0;
            font-size: 0.85rem;
            color: var(--color-muted);
            line-height: 1.5;
          }
          .mini-btn {
            display: inline-block;
            background: var(--color-bg);
            color: var(--color-text);
            border: 1px solid var(--color-border);
            text-decoration: none;
            padding: 0.5rem 0.75rem;
            border-radius: var(--radius-sm);
            font-weight: 500;
            font-size: 0.85rem;
            text-align: center;
            margin-top: 0.5rem;
            transition: all 0.2s;
            box-shadow: var(--shadow-sm);
          }
          .mini-btn:hover {
            background: var(--color-secondary);
            border-color: #d1d5db;
          }
          .mini-btn-indigo {
            background: var(--color-bg);
            border: 1px solid var(--color-border);
            color: var(--color-text);
          }
          .mini-btn-indigo:hover {
            background: var(--color-secondary);
          }
          .doc-count-badge {
            background: var(--color-secondary);
            color: var(--color-muted);
            padding: 0.4rem 0.75rem;
            border-radius: var(--radius-sm);
            font-size: 0.8rem;
            font-weight: 500;
            text-align: center;
            border: 1px solid var(--color-border);
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
