'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import ApprovalCard from '../components/ApprovalCard';
import { fetchConversations, fetchPendingApprovals, fetchDocuments, patchApproval, getUser } from '@/lib/api';
import { getAccessibleAgents } from '@/lib/planGating';

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
  const plan = user?.subscriptionPlan || 'none';
  const planLabel = plan !== 'none' ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'No Plan';
  const statusLabel = user?.subscriptionStatus === 'trialing' ? 'Trial' : user?.subscriptionStatus === 'active' ? 'Active' : '';
  const accessibleAgents = getAccessibleAgents(plan);

  // Quick action cards — filtered by plan
  const agentCards = [
    { label: 'Customer Support Agent', href: '/chat', icon: 'forum', iconColor: 'text-primary', route: '/chat',
      description: 'AI-powered customer support conversations, ticket resolution, and knowledge-based responses.' },
    { label: 'Sales Agent', href: '/sales', icon: 'trending_up', iconColor: 'text-tertiary', route: '/sales',
      description: 'CRM Leads, Pricing Quotes (Max 15% Cap), Contract Approvals & Revenue Forecast.' },
    { label: 'Procurement Agent', href: '/procurement', icon: 'shopping_cart', iconColor: 'text-secondary', route: '/procurement',
      description: 'Supplier discovery, purchase order management, and spend analytics.' },
    { label: 'HR Agent', href: '/hr', icon: 'groups', iconColor: 'text-primary', route: '/hr',
      description: 'Screen resumes, rank candidates via semantic search, and auto-schedule interviews.' },
    { label: 'Finance Agent', href: '/finance', icon: 'account_balance', iconColor: 'text-amber-400', route: '/finance',
      description: 'Invoice processing, expense tracking, budget monitoring, and financial reporting.' },
    { label: 'Analytics Agent', href: '/analytics', icon: 'analytics', iconColor: 'text-emerald-400', route: '/analytics',
      description: 'Cross-department analytics, KPI dashboards, and AI-generated business insights.' },
    { label: 'Coding Agent', href: '/coding', icon: 'code', iconColor: 'text-violet-400', route: '/coding',
      description: 'GitHub-connected code analysis, PR reviews, and automated development workflows.' },
    { label: 'PM Agent', href: '/pm', icon: 'account_tree', iconColor: 'text-secondary', route: '/pm',
      description: 'Monitor project deadlines, track completion pacing velocity, and manage team rosters.' },
  ];

  const visibleAgentCards = agentCards.filter(card =>
    accessibleAgents.some(route => card.route.startsWith(route))
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <main className="max-w-container-max mx-auto px-lg py-xl">
          {/* Welcome Banner */}
          <header className="mb-xl border-b border-outline-variant pb-lg flex flex-col md:flex-row md:items-center justify-between gap-md">
            <div>
              <div className="flex items-center gap-sm mb-sm flex-wrap">
                <span className="font-label-md text-label-md text-on-surface-variant bg-surface-container px-3 py-1 rounded-full border border-outline-variant">
                  ⚡ Tenant Control Panel
                </span>
                {user?.role && (
                  <span className={`font-label-md text-label-md px-3 py-1 rounded-full border ${isAdmin ? 'text-primary bg-primary-container/10 border-primary/20' : 'text-tertiary bg-tertiary-container/10 border-tertiary/20'}`}>
                    Role: {user.role}
                  </span>
                )}
                {plan !== 'none' && (
                  <span className="font-label-md text-label-md px-3 py-1 rounded-full border text-primary bg-primary-container/10 border-primary/20 font-bold">
                    {planLabel} Plan {statusLabel && `· ${statusLabel}`}
                  </span>
                )}
              </div>
              <h1 className="font-display-lg text-display-lg text-on-surface mb-2">
                Enterprise AI Dashboard
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                Centralized management for AI agent conversations, human approval queues, vector knowledge bases, and embeddable widget deployments.
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/billing" className="inline-flex items-center gap-2 px-lg py-md bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold rounded-lg hover:bg-surface-container-highest transition-colors shadow-sm whitespace-nowrap border border-outline-variant">
                <span className="material-symbols-outlined text-base">payments</span>
                Manage Billing
              </Link>
              <Link href="/widget-setup" className="inline-flex items-center gap-2 px-lg py-md bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors shadow-sm whitespace-nowrap">
                🧩 Deploy Web Widget ➔
              </Link>
            </div>
          </header>

          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-lg relative overflow-hidden group hover:border-outline transition-colors">
              <div className="flex justify-between items-start mb-4">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Customer Conversations</span>
                <span className="material-symbols-outlined text-primary">forum</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display-lg text-display-lg text-on-surface">{conversations.length}</span>
              </div>
              <Link href="/chat" className="inline-block mt-4 text-primary font-label-md text-label-md hover:underline">
                View Chat Histories ➔
              </Link>
            </div>

            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-lg relative overflow-hidden group hover:border-outline transition-colors">
              <div className="flex justify-between items-start mb-4">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Pending Approvals</span>
                <span className="material-symbols-outlined text-tertiary">fact_check</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display-lg text-display-lg text-on-surface">{pendingApprovals.length}</span>
                {pendingApprovals.length > 0 && (
                  <span className="font-label-md text-label-md text-error bg-error-container/20 px-2 py-0.5 rounded font-mono">ACTION REQ</span>
                )}
              </div>
              <span className="block mt-4 font-label-md text-label-md text-on-surface-variant">Human-in-the-Loop</span>
            </div>

            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-lg relative overflow-hidden group hover:border-outline transition-colors">
              <div className="flex justify-between items-start mb-4">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Indexed Knowledge Docs</span>
                <span className="material-symbols-outlined text-secondary">description</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display-lg text-display-lg text-on-surface">{documents.length}</span>
                <span className="font-label-md text-label-md text-on-surface-variant px-2 py-0.5 rounded font-mono">Synced</span>
              </div>
              <span className="block mt-4 font-label-md text-label-md text-on-surface-variant">Vector Retrieval (RAG)</span>
            </div>
          </section>

          {/* Main Dashboard Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
            {/* Left Column: Human Approval Queue */}
            <section className="lg:col-span-2">
              <div className="flex justify-between items-center mb-lg">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">gavel</span>
                  <div>
                    <h3 className="font-headline-md text-headline-md text-on-surface">Human Approval Queue</h3>
                    <p className="font-body-md text-body-md text-on-surface-variant">High-risk actions awaiting Reviewer / Admin authorization</p>
                  </div>
                </div>
                <span className="font-mono-sm text-mono-sm text-tertiary bg-tertiary-container/10 px-3 py-1 rounded-full border border-tertiary/20">
                  {pendingApprovals.length} Pending
                </span>
              </div>

              {loading ? (
                <div className="bg-surface-container border border-outline-variant rounded-lg p-xl text-center text-on-surface-variant">
                  Loading approval queue...
                </div>
              ) : pendingApprovals.length === 0 ? (
                <div className="bg-surface-container border border-outline-variant rounded-lg p-xl text-center text-emerald-400 font-medium bg-emerald-950/20 border-emerald-800/40">
                  ✅ No pending approval requests. All agent tools are executing within safety parameters.
                </div>
              ) : (
                <div className="space-y-4">
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
            </section>

            {/* Right Column: Quick Actions — filtered by plan */}
            <aside className="lg:col-span-1 space-y-md">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-lg">AI Agents</h3>

              {visibleAgentCards.map((card) => (
                <div key={card.href} className="bg-surface border border-outline-variant rounded-lg p-md hover:border-primary/50 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`material-symbols-outlined ${card.iconColor}`}>{card.icon}</span>
                    <h4 className="font-body-md text-body-md font-medium text-on-surface">{card.label}</h4>
                  </div>
                  <p className="font-label-md text-label-md text-on-surface-variant mb-4">
                    {card.description}
                  </p>
                  <Link href={card.href} className="inline-block w-full text-center px-md py-2 bg-surface-container-high border border-outline-variant rounded-md text-on-surface hover:bg-surface-container-highest transition-colors font-label-md text-label-md">
                    Open {card.label} ➔
                  </Link>
                </div>
              ))}

              {/* Universal Approvals Hub */}
              <div className="bg-surface border border-outline-variant rounded-lg p-md hover:border-error/50 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-error">gavel</span>
                  <h4 className="font-body-md text-body-md font-medium text-on-surface">Universal Approvals Hub</h4>
                </div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-4">
                  Review and authorize human-in-the-loop actions for Finance and Sales.
                </p>
                <Link href="/approvals" className="inline-block w-full text-center px-md py-2 bg-error-container/20 border border-error/30 rounded-md text-error hover:bg-error-container/40 transition-colors font-label-md text-label-md">
                  Open Approvals Hub ➔
                </Link>
              </div>

              {/* MCP Tools Card */}
              <div className="bg-surface border border-outline-variant rounded-lg p-md hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-primary">extension</span>
                  <h4 className="font-body-md text-body-md font-medium text-on-surface">MCP Tools & Connectors</h4>
                </div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-4">
                  Connect unlimited external MCP servers and configure per-agent tool allowlists.
                </p>
                <Link href="/mcp" className="inline-block w-full text-center px-md py-2 bg-surface-container-high border border-outline-variant rounded-md text-on-surface hover:bg-surface-container-highest transition-colors font-label-md text-label-md">
                  Manage MCP Tools ➔
                </Link>
              </div>

              {/* Widget Setup Card */}
              <div className="bg-surface border border-outline-variant rounded-lg p-md hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-secondary">widgets</span>
                  <h4 className="font-body-md text-body-md font-medium text-on-surface">Standalone Web Widget</h4>
                </div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-4">
                  Embed the customer support widget into your website HTML with a single script tag.
                </p>
                <Link href="/widget-setup" className="inline-block w-full text-center px-md py-2 bg-surface-container-high border border-outline-variant rounded-md text-on-surface hover:bg-surface-container-highest transition-colors font-label-md text-label-md">
                  Get Widget Script ➔
                </Link>
              </div>

              {/* User Management Card (Admin Only) */}
              {isAdmin && (
                <div className="bg-surface border border-outline-variant rounded-lg p-md hover:border-primary/50 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-tertiary">group</span>
                    <h4 className="font-body-md text-body-md font-medium text-on-surface">Reviewer Accounts</h4>
                  </div>
                  <p className="font-label-md text-label-md text-on-surface-variant mb-4">
                    Provision discrete login credentials for team members restricted to approval queue management.
                  </p>
                  <Link href="/users" className="inline-block w-full text-center px-md py-2 bg-surface-container-high border border-outline-variant rounded-md text-on-surface hover:bg-surface-container-highest transition-colors font-label-md text-label-md">
                    Manage Team Users ➔
                  </Link>
                </div>
              )}

              {/* Knowledge Base Card */}
              <div className="bg-surface border border-outline-variant rounded-lg p-md">
                <div className="flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-primary">menu_book</span>
                  <h4 className="font-body-md text-body-md font-medium text-on-surface">Knowledge Base (RAG)</h4>
                </div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-3">
                  {isAdmin
                    ? 'Upload PDF and DOCX files to feed vector retrieval memory.'
                    : 'Read-only view of uploaded company knowledge docs.'}
                </p>
                <div className="font-mono-sm text-mono-sm text-primary bg-primary-container/10 px-3 py-1 rounded text-center border border-primary/20">
                  {documents.length} File(s) Indexed
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
