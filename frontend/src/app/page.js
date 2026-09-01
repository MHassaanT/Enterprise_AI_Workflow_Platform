'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/api';

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  
  // Interactive Agent Simulator State
  // Changed default to support to present a completely benign first impression
  const [activeAgent, setActiveAgent] = useState('support');

  // ROI Calculator State
  const [teamSize, setTeamSize] = useState(50);
  const [hoursPerWeek, setHoursPerWeek] = useState(12);

  // FAQ Toggle State
  const [expandedFaq, setExpandedFaq] = useState(null);

  // MCP Inspector Active Tool State
  // Changed default from hunter to hubspot
  const [activeMcpTool, setActiveMcpTool] = useState('hubspot');

  useEffect(() => {
    const token = getToken();
    if (token) {
      setIsLoggedIn(true);
      setUser(getUser());
    }
  }, []);

  // Agent Simulator Data Definitions
  const agentData = {
    sales: {
      name: 'Inbound Sales Assistant',
      badge: 'Inbound Processing & CRM',
      icon: 'trending_up',
      color: 'from-amber-500 to-orange-600',
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      description: 'Processes inbound prospect inquiries, enriches CRM records from opted-in form data, drafts contextual replies for sales rep review, and manages internal followup loops.',
      tools: ['HubSpot CRM Sync', 'Inbound Webhook Engine', 'Opt-in Verifier', 'Gemini 2.5 Copy Assistant'],
      nodes: [
        { id: 1, name: 'Inquiry Parsing', status: 'completed' },
        { id: 2, name: 'Opt-In Verification', status: 'completed' },
        { id: 3, name: 'Response Drafting', status: 'completed' },
        { id: 4, name: 'Human Approval Gate', status: 'active' },
        { id: 5, name: 'CRM Update & Dispatch', status: 'pending' },
      ],
      logs: [
        { time: '10:04:12', type: 'info', msg: '[LANGGRAPH_NODE] Initialized inbound processing for new demo request' },
        { time: '10:04:15', type: 'success', msg: '[CRM_SYNC] Matched existing account Acme Corp in database' },
        { time: '10:04:18', type: 'success', msg: '[VERIFICATION] Confirmed double opt-in status for inbound prospect' },
        { time: '10:04:21', type: 'warning', msg: '[HITL_CHECKPOINT] Drafted response queued for sales rep approval' },
      ],
      jsonPayload: `{
  "agent_id": "inbound_sales_v2",
  "inquiry_type": "Demo Request",
  "crm_record_found": true,
  "opt_in_verified": true,
  "requires_approval": true,
  "approval_reason": "Standard human review for external communication"
}`
    },
    hr: {
      name: 'Internal HR Support Agent',
      badge: 'Employee Policy RAG & Support',
      icon: 'groups',
      color: 'from-blue-500 to-indigo-600',
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      description: 'Ingests PDF/DOCX employee handbooks, semantically matches internal policy queries using Qdrant vector search, schedules internal syncs, and handles employee leave requests.',
      tools: ['Qdrant Vector DB', 'pdf-parse / mammoth', 'Google Gemini Embeddings', 'Calendar Dispatch'],
      nodes: [
        { id: 1, name: 'Policy Document Ingestion', status: 'completed' },
        { id: 2, name: 'Qdrant Vector Search', status: 'completed' },
        { id: 3, name: 'Policy Matching', status: 'completed' },
        { id: 4, name: 'PTO Logging', status: 'completed' },
        { id: 5, name: 'HR Audit Logging', status: 'completed' },
      ],
      logs: [
        { time: '11:15:02', type: 'info', msg: '[RAG_INGRESS] Processing query: "What is the Q3 holiday schedule?"' },
        { time: '11:15:05', type: 'success', msg: '[QDRANT] Vector embedding search matched "2026_Employee_Handbook_v2.pdf" (score: 0.98)' },
        { time: '11:15:07', type: 'success', msg: '[HR_SUPPORT] Dispatched internal response via Slack integration' },
        { time: '11:15:09', type: 'info', msg: '[AUDIT_TRAIL] Recorded internal policy query under tenant_id: t_8f921a' },
      ],
      jsonPayload: `{
  "agent_id": "hr_internal_v1",
  "employee_id": "EMP-492",
  "query_category": "Benefits & Holidays",
  "semantic_match_score": 0.98,
  "source_document": "2026_Employee_Handbook_v2.pdf",
  "action_taken": "Answered via internal Slack channel"
}`
    },
    finance: {
      name: 'Finance & Ledger Agent',
      badge: 'PO Reconciliation & Budget Caps',
      icon: 'payments',
      color: 'from-emerald-500 to-teal-600',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      description: 'Parses vendor invoices, reconciles purchase orders against general ledger accounts, enforces strict department budget caps, and triggers automated payment disbursements.',
      tools: ['FastMCP Stripe Gateway', 'PostgreSQL Ledger Sync', 'OCR Invoice Extractor', 'Budget Cap Enforcer'],
      nodes: [
        { id: 1, name: 'Invoice Receipt', status: 'completed' },
        { id: 2, name: 'GL Account Matching', status: 'completed' },
        { id: 3, name: 'Budget Cap Verification', status: 'completed' },
        { id: 4, name: 'HITL Review ($1,000+ Cap)', status: 'active' },
        { id: 5, name: 'Stripe Disbursement', status: 'pending' },
      ],
      logs: [
        { time: '14:22:30', type: 'info', msg: '[FINANCE_LEDGER] Ingested Vendor Invoice #INV-94021 ($4,500.00)' },
        { time: '14:22:32', type: 'success', msg: '[BUDGET_ENFORCER] Verified Engineering Q3 Software budget ($24,000 remaining)' },
        { time: '14:22:35', type: 'warning', msg: '[HITL_CHECKPOINT] Payment amount $4,500 exceeds $1,000 auto-approval threshold' },
        { time: '14:22:38', type: 'info', msg: '[APPROVAL_QUEUE] Notification dispatched to VP of Finance for review' },
      ],
      jsonPayload: `{
  "agent_id": "finance_ledger_v1",
  "invoice_id": "INV-94021",
  "vendor_name": "Datadog Cloud Solutions",
  "amount_usd": 4500.00,
  "department": "Engineering",
  "budget_remaining": 24000.00,
  "auto_approved": false,
  "approval_status": "Awaiting VP Finance Approval"
}`
    },
    procurement: {
      name: 'Procurement Agent',
      badge: 'Vendor Scoring & Automated RFQs',
      icon: 'shopping_cart',
      color: 'from-purple-500 to-pink-600',
      textColor: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
      description: 'Discovers verified B2B vendors, crafts multi-vendor Request for Quotes (RFQs), synthesizes dynamic vendor scoring matrices, and manages price negotiation rounds.',
      tools: ['Vendor Discovery Engine', 'Dynamic Scoring Matrix', 'FastMCP Mail Gateway', 'Contract Parser'],
      nodes: [
        { id: 1, name: 'RFQ Requirement Spec', status: 'completed' },
        { id: 2, name: 'Vendor Discovery', status: 'completed' },
        { id: 3, name: 'RFQ Dispatch', status: 'completed' },
        { id: 4, name: 'Scoring Matrix Synthesis', status: 'completed' },
        { id: 5, name: 'Vendor Selection Final', status: 'completed' },
      ],
      logs: [
        { time: '15:10:00', type: 'info', msg: '[PROCUREMENT_SUPERVISOR] Generated RFQ for "50x High-Spec Workstation Laptops"' },
        { time: '15:10:04', type: 'success', msg: '[VENDOR_SEARCH] Identified 5 eligible hardware vendors' },
        { time: '15:10:09', type: 'success', msg: '[SCORING_MATRIX] Vendor B scored 94.2/100 (Best Price-to-SLA Ratio)' },
        { time: '15:10:12', type: 'success', msg: '[DECISION_SAVED] Vendor B selected. Contract drafted for procurement lead.' },
      ],
      jsonPayload: `{
  "agent_id": "procurement_agent_v1",
  "rfq_id": "RFQ-2026-88A",
  "item": "Enterprise Workstation Hardware",
  "selected_vendor": "Nexus Hardware Systems",
  "winning_quote_usd": 62500.00,
  "savings_percentage": "14.2% vs initial benchmark"
}`
    },
    coding: {
      name: 'Coding & Repository Agent',
      badge: 'GitHub Token Resolution & Code Audits',
      icon: 'code',
      color: 'from-cyan-500 to-blue-600',
      textColor: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
      description: 'Securely decrypts tenant-level GitHub tokens, parses repository AST code structure, detects security vulnerabilities, and generates automated refactoring Pull Requests.',
      tools: ['GitHub Decrypt Proxy', 'AST Code Parser', 'Security Scanner', 'Auto-PR Generator'],
      nodes: [
        { id: 1, name: 'Tenant Token Decrypt', status: 'completed' },
        { id: 2, name: 'File Tree & AST Parsing', status: 'completed' },
        { id: 3, name: 'Vulnerability Audit', status: 'completed' },
        { id: 4, name: 'Refactoring Generation', status: 'completed' },
        { id: 5, name: 'Pull Request Dispatch', status: 'completed' },
      ],
      logs: [
        { time: '16:04:12', type: 'info', msg: '[CODING_PROXY] Decrypted user GitHub OAuth token for repo "enterprise-api"' },
        { time: '16:04:15', type: 'success', msg: '[AST_PARSER] Analysed 142 source files. Found 2 deprecated middleware patterns.' },
        { time: '16:04:19', type: 'success', msg: '[GEMINI_CODE] Generated refactored express router with native async handlers' },
        { time: '16:04:22', type: 'success', msg: '[GITHUB_API] Opened PR #48 "Refactor Express Middleware to Async Standard"' },
      ],
      jsonPayload: `{
  "agent_id": "coding_agent_v1",
  "target_repo": "MHassaanT/Enterprise_AI_Workflow_Platform",
  "token_resolution": "Tenant Decrypted - OK",
  "files_modified": 3,
  "security_issues_fixed": 2,
  "pull_request_url": "https://github.com/MHassaanT/Enterprise_AI_Workflow_Platform/pull/48"
}`
    },
    support: {
      name: 'Support & RAG Assistant',
      badge: '24/7 Vector Knowledge & Escalation',
      icon: 'forum',
      color: 'from-indigo-500 to-purple-600',
      textColor: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/30',
      description: 'Operates 24/7 embedding-driven RAG support with FLARE intent classification to answer complex queries, cite knowledge sources, and seamlessly handoff to human support.',
      tools: ['FLARE Intent Classifier', 'Qdrant Vector Hybrid RAG', 'Inline Citation Engine', 'Human Escalation Gate'],
      nodes: [
        { id: 1, name: 'Widget Ingress', status: 'completed' },
        { id: 2, name: 'FLARE Intent Classification', status: 'completed' },
        { id: 3, name: 'Qdrant Hybrid Retrieval', status: 'completed' },
        { id: 4, name: 'Response & Citation Synthesis', status: 'completed' },
        { id: 5, name: 'Human Review Checkpoint', status: 'completed' },
      ],
      logs: [
        { time: '17:40:01', type: 'info', msg: '[WIDGET_INGRESS] Received user question: "How do I configure RLS policies for my tenant?"' },
        { time: '17:40:03', type: 'success', msg: '[FLARE_CLASSIFIER] Intent: Knowledge Base Query -> Vector Search Triggered' },
        { time: '17:40:05', type: 'success', msg: '[QDRANT_RAG] Retrieved 3 relevant chunks from docs/architecture_overview.md' },
        { time: '17:40:07', type: 'success', msg: '[RESPONSE] Formatted answer with inline citations [doc: architecture_overview.md#L45]' },
      ],
      jsonPayload: `{
  "agent_id": "support_rag_v1",
  "query": "How do I configure RLS policies for my tenant?",
  "intent": "KNOWLEDGE_BASE_RAG",
  "citations": ["docs/architecture_overview.md#L45"],
  "confidence_score": 0.97,
  "human_escalation_required": false
}`
    }
  };

  // MCP Tools Inspector Data
  const mcpTools = {
    hubspot: {
      name: 'HubSpot CRM Sync',
      category: 'Sales & Contact Engine',
      endpoint: '/mcp/tools/crm_sync',
      code: `// FastMCP Tool Surface Definition
@mcp_server.tool(name="crm_sync")
async def crm_sync(email: str, company: str) -> dict:
    """Syncs inbound opted-in prospect data with CRM database."""
    result = await hubspot_client.update_contact(email, company)
    return {"crm_id": result.id, "status": "synced"}`
    },
    stripe: {
      name: 'Stripe PO Disbursement',
      category: 'Finance & Ledger Gateway',
      endpoint: '/mcp/tools/stripe_disburse',
      code: `// FastMCP Tool Surface Definition
@mcp_server.tool(name="stripe_disburse")
async def stripe_disburse(po_id: str, amount_cents: int) -> dict:
    """Safely triggers vendor payouts with 3-stage validation."""
    verify_budget_cap(po_id, amount_cents)
    payout = await stripe.Payout.create(amount=amount_cents, currency="usd")
    return {"payout_id": payout.id, "status": payout.status}`
    },
    github: {
      name: 'GitHub Tenant Code Proxy',
      category: 'Developer & Code Audit',
      endpoint: '/mcp/tools/github_code_proxy',
      code: `// FastMCP Tool Surface Definition
@mcp_server.tool(name="github_code_proxy")
async def github_code_proxy(repo: str, branch: str) -> dict:
    """Fetches AST file tree using decrypted tenant OAuth token."""
    token = await decrypt_tenant_token(ctx.tenant_id)
    tree = await github.get_tree(repo, branch, token=token)
    return {"repo": repo, "tree_hash": tree.sha, "files": len(tree.files)}`
    },
    qdrant: {
      name: 'Qdrant Vector Tenant RAG',
      category: 'Search & Embeddings',
      endpoint: '/mcp/tools/qdrant_vector_search',
      code: `// FastMCP Tool Surface Definition
@mcp_server.tool(name="qdrant_vector_search")
async def qdrant_search(query: str, top_k: int = 5) -> dict:
    """Executes tenant-filtered vector search via Gemini embeddings."""
    vec = await gemini.embed(query)
    hits = await qdrant.search(collection="docs", query_vector=vec, filter={"tenant_id": ctx.tenant_id})
    return {"hits": hits}`
    }
  };

  // ROI Calculations
  const calculatedHoursSaved = Math.round(teamSize * hoursPerWeek * 4.3);
  const calculatedCostSavings = Math.round(calculatedHoursSaved * 65);
  const calculatedWorkflows = Math.round(teamSize * 18.5);

  const currentAgent = agentData[activeAgent];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#E3E2E2] font-body-md antialiased selection:bg-blue-600/40 selection:text-white">
      
      {/* ── TOP GLASS NAVBAR ── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0B0F17]/70 backdrop-blur-md border-b border-white/10 transition-all shadow-2xl">
        <div className="max-w-[1440px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-11 w-11 rounded-xl bg-blue-600/15 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:border-blue-400 transition-all group-hover:scale-105 shadow-lg shadow-blue-500/10">
              <span className="material-symbols-outlined text-2xl">hexagon</span>
            </div>
            <div>
              <span className="font-display-lg text-xl font-black text-white tracking-tight">Enterprise AI</span>
              <span className="block text-xs text-blue-400 font-mono font-semibold tracking-wider uppercase">Workforce Platform</span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-8 text-sm text-gray-300 font-medium">
            <a href="#agents" className="hover:text-blue-400 transition-colors">AI Workforce</a>
            <a href="#simulator" className="hover:text-blue-400 transition-colors">Live Simulator</a>
            <a href="#workflow" className="hover:text-blue-400 transition-colors">Visual Workflows</a>
            <a href="#mcp" className="hover:text-blue-400 transition-colors">MCP Gateway</a>
            <a href="#security" className="hover:text-blue-400 transition-colors">Security & RLS</a>
            <a href="#pricing" className="hover:text-blue-400 transition-colors">Pricing</a>
            <a href="#calculator" className="hover:text-blue-400 transition-colors">ROI Calculator</a>
          </nav>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2 border border-blue-400/30"
              >
                <span className="material-symbols-outlined text-lg">dashboard</span>
                Control Panel
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2.5 text-gray-300 hover:text-white text-sm font-semibold transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-600/20 border border-blue-400/30 flex items-center gap-2"
                >
                  <span>Get Started Free</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative pt-20 pb-32 overflow-hidden border-b border-white/10">
        {/* Glowing Mesh Ambient Effects */}
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-blue-600/15 blur-[160px] rounded-full pointer-events-none animate-pulse-glow"></div>
        <div className="absolute top-32 right-10 w-[450px] h-[350px] bg-purple-600/10 blur-[150px] rounded-full pointer-events-none"></div>
        <div className="absolute top-48 left-10 w-[400px] h-[300px] bg-cyan-500/10 blur-[140px] rounded-full pointer-events-none"></div>

        <div className="max-w-[1440px] mx-auto px-6 text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-950/60 border border-blue-500/30 text-blue-300 text-xs font-semibold mb-8 backdrop-blur-md shadow-inner">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 -ml-4"></span>
            <span>Next-Gen Multi-Agent Enterprise Orchestration Platform</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tight max-w-5xl mx-auto leading-[1.12] mb-8">
            Orchestrate Autonomous <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              AI Workforces
            </span> Across Your Enterprise
          </h1>

          <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed mb-12">
            Unify Inbound Sales processing, Internal HR policy support, Procurement RFQs, Finance ledger reconciliation, and Code auditing under one secure, human-governed AI Workforce platform.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 mb-16">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white font-bold rounded-2xl hover:brightness-110 transition-all shadow-xl shadow-blue-600/30 flex items-center justify-center gap-3 text-lg border border-blue-400/40"
            >
              <span>Create Enterprise Workspace</span>
              <span className="material-symbols-outlined">rocket_launch</span>
            </Link>
            <a
              href="#simulator"
              className="w-full sm:w-auto px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 text-lg backdrop-blur-md"
            >
              <span className="material-symbols-outlined text-blue-400">play_circle</span>
              <span>Launch Agent Simulator</span>
            </a>
          </div>

          {/* Metric Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto p-4 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
            <div className="p-4 border-r border-white/10 last:border-0 text-center">
              <div className="text-3xl lg:text-4xl font-black text-blue-400 mb-1">10x</div>
              <div className="text-xs text-gray-400 font-medium">Execution Velocity</div>
            </div>
            <div className="p-4 border-r border-white/10 last:border-0 text-center">
              <div className="text-3xl lg:text-4xl font-black text-cyan-400 mb-1">100%</div>
              <div className="text-xs text-gray-400 font-medium">Human Approval Safety</div>
            </div>
            <div className="p-4 border-r border-white/10 last:border-0 text-center">
              <div className="text-3xl lg:text-4xl font-black text-purple-400 mb-1">FastMCP</div>
              <div className="text-xs text-gray-400 font-medium">Streamable Protocol</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-3xl lg:text-4xl font-black text-emerald-400 mb-1">PostgreSQL RLS</div>
              <div className="text-xs text-gray-400 font-medium">Native Multi-Tenancy</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SPECIALIZED AI AGENT WORKFORCE ── */}
      <section id="agents" className="py-24 border-b border-white/10 relative">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs text-blue-400 font-mono uppercase tracking-widest font-bold block mb-3">Specialized Autonomous Workforce</span>
            <h2 className="text-4xl font-extrabold text-white mb-4">Dedicated AI Agents for Every Core Department</h2>
            <p className="text-gray-400 text-base">
              Each AI agent operates domain-specific LangGraph stateful graphs equipped with specialized tool bindings, vector knowledge RAG, and strict audit governance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Sales Agent */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 hover:border-amber-500/50 transition-all duration-300 group flex flex-col justify-between hover:shadow-2xl hover:shadow-amber-500/10">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">trending_up</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Inbound Sales Assistant</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  Processes inbound prospect inquiries, enriches CRM records from opted-in form data, drafts contextual replies for sales rep review, and manages internal followup loops.
                </p>
              </div>
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-amber-400 font-semibold font-mono">Inbound CRM Integration</span>
                <span className="material-symbols-outlined text-amber-400 text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </div>

            {/* HR Agent */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 hover:border-blue-500/50 transition-all duration-300 group flex flex-col justify-between hover:shadow-2xl hover:shadow-blue-500/10">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">groups</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Internal HR Support Agent</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  Ingests PDF/DOCX employee handbooks, semantically matches internal policy queries using Qdrant vector search, schedules internal syncs, and handles employee leave requests.
                </p>
              </div>
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-blue-400 font-semibold font-mono">Internal Policy Support</span>
                <span className="material-symbols-outlined text-blue-400 text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </div>

            {/* Finance Agent */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 hover:border-emerald-500/50 transition-all duration-300 group flex flex-col justify-between hover:shadow-2xl hover:shadow-emerald-500/10">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">payments</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Finance & Ledger Agent</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  Extracts vendor invoice line items, reconciles POs against PostgreSQL ledger tables, enforces strict department budget caps, and dispatches payment payouts.
                </p>
              </div>
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-emerald-400 font-semibold font-mono">PO & Ledger Automation</span>
                <span className="material-symbols-outlined text-emerald-400 text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </div>

            {/* Procurement Agent */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 hover:border-purple-500/50 transition-all duration-300 group flex flex-col justify-between hover:shadow-2xl hover:shadow-purple-500/10">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">shopping_cart</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Procurement Agent</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  Discovers verified suppliers, drafts automated Request for Quotes (RFQs), synthesizes multi-factor vendor scoring matrices, and negotiates pricing contract terms.
                </p>
              </div>
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-purple-400 font-semibold font-mono">RFQs & Vendor Scoring</span>
                <span className="material-symbols-outlined text-purple-400 text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </div>

            {/* Coding Agent */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 hover:border-cyan-500/50 transition-all duration-300 group flex flex-col justify-between hover:shadow-2xl hover:shadow-cyan-500/10">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">code</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Coding & Repository Agent</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  Decrypts user GitHub OAuth tokens per tenant, inspects code repository file trees, parses AST structure, detects vulnerabilities, and proposes automated PR refactoring.
                </p>
              </div>
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-cyan-400 font-semibold font-mono">AST Audits & Auto-PRs</span>
                <span className="material-symbols-outlined text-cyan-400 text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </div>

            {/* Support Agent */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 hover:border-indigo-500/50 transition-all duration-300 group flex flex-col justify-between hover:shadow-2xl hover:shadow-indigo-500/10">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">forum</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Support & RAG Assistant</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  Delivers 24/7 embedding-driven RAG support over company documentation, uses FLARE intent classification to optimize vector search, and routes to human approval.
                </p>
              </div>
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-indigo-400 font-semibold font-mono">24/7 Support & Hybrid RAG</span>
                <span className="material-symbols-outlined text-indigo-400 text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE LIVE AGENT SIMULATOR ── */}
      <section id="simulator" className="py-24 bg-white/[0.01] border-b border-white/10 relative">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs text-blue-400 font-mono uppercase tracking-widest font-bold block mb-3">Interactive Workspace Preview</span>
            <h2 className="text-4xl font-extrabold text-white mb-4">See Autonomous Agents in Action</h2>
            <p className="text-gray-400 text-base">
              Select an agent workspace below to inspect live LangGraph execution steps, tool bindings, and structured JSON output payloads in real-time.
            </p>
          </div>

          {/* Tab Selection */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {Object.keys(agentData).map((key) => {
              const item = agentData[key];
              const isActive = activeAgent === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveAgent(key)}
                  className={`px-5 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-2 border ${
                    isActive
                      ? `bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-500/20`
                      : `bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06]`
                  }`}
                >
                  <span className={`material-symbols-outlined text-lg ${isActive ? item.textColor : ''}`}>
                    {item.icon}
                  </span>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>

          {/* Simulator Console Canvas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-[#0D0F16] border border-white/10 rounded-3xl p-6 lg:p-8 shadow-2xl relative overflow-hidden">
            
            {/* Left Column: Agent Overview & Graph Pipeline */}
            <div className="lg:col-span-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10 pb-6 lg:pb-0 lg:pr-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full ${currentAgent.bgColor} ${currentAgent.textColor} border ${currentAgent.borderColor}`}>
                    {currentAgent.badge}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    ACTIVE_GRAPH_NODE
                  </span>
                </div>

                <h3 className="text-2xl font-bold text-white mb-3">{currentAgent.name}</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">{currentAgent.description}</p>

                {/* Integrated Tools List */}
                <div className="mb-6">
                  <div className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-3">Bound MCP & Internal Tools</div>
                  <div className="flex flex-wrap gap-2">
                    {currentAgent.tools.map((t, idx) => (
                      <span key={idx} className="text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-gray-300 font-mono flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-blue-400 text-xs">build</span>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* LangGraph Pipeline Node Steps */}
                <div>
                  <div className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-3">LangGraph Execution Flow</div>
                  <div className="space-y-2">
                    {currentAgent.nodes.map((n) => (
                      <div
                        key={n.id}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono transition-all ${
                          n.status === 'completed'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : n.status === 'active'
                            ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-md shadow-amber-500/10 animate-pulse'
                            : 'bg-white/[0.02] border-white/5 text-gray-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                            {n.id}
                          </span>
                          <span>{n.name}</span>
                        </div>
                        <span className="uppercase text-[10px] tracking-wider font-bold">
                          {n.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Execution Logs & JSON Output */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Terminal Logs Box */}
              <div className="bg-[#07090E] border border-white/10 rounded-2xl p-5 font-mono text-xs">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
                    <span className="ml-2 text-gray-300 font-medium">execution_stream.log</span>
                  </div>
                  <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">REALTIME_STREAM</span>
                </div>
                <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-2">
                  {currentAgent.logs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-gray-400 shrink-0">[{log.time}]</span>
                      <span
                        className={
                          log.type === 'success'
                            ? 'text-emerald-400'
                            : log.type === 'warning'
                            ? 'text-amber-400 font-bold'
                            : 'text-blue-300'
                        }
                      >
                        {log.msg}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* JSON Output Payload */}
              <div className="bg-[#07090E] border border-white/10 rounded-2xl p-5 font-mono text-xs">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-purple-400 text-sm">data_object</span>
                    <span className="text-gray-300 font-medium">agent_state_response.json</span>
                  </div>
                  <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">RLS_TENANT_SCOPED</span>
                </div>
                <pre className="text-cyan-300 bg-black/40 p-4 rounded-xl overflow-x-auto border border-white/5 leading-relaxed">
                  {currentAgent.jsonPayload}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── VISUAL WORKFLOW BUILDER CANVAS SECTION ── */}
      <section id="workflow" className="py-24 border-b border-white/10 relative">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            
            {/* Text & Features */}
            <div>
              <span className="text-xs text-blue-400 font-mono uppercase tracking-widest font-bold block mb-3">Visual Automation Engine</span>
              <h2 className="text-4xl font-extrabold text-white mb-6 leading-tight">
                Construct Multi-Agent Workflows With Node-Based Precision
              </h2>
              <p className="text-gray-300 text-lg mb-8 leading-relaxed">
                Build custom LangGraph state machines visually using our React Flow canvas. Connect custom triggers, specialized agent nodes, Model Context Protocol (MCP) tools, and human approval policy checkpoints effortlessly.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0 mt-1">
                    <span className="material-symbols-outlined text-xl">hub</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">Stateful LangGraph DAG Execution</h4>
                    <p className="text-gray-400 text-sm">Chain inbound sales processing, contract verification, and finance ledgers with zero state loss.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 mt-1">
                    <span className="material-symbols-outlined text-xl">gavel</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">Human-in-the-Loop Governance</h4>
                    <p className="text-gray-400 text-sm">High-risk agent operations (payments, external communications, contracts) automatically queue for human authorization.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Workflow Canvas Mockup */}
            <div className="bg-[#090C14] border border-white/10 rounded-3xl p-6 shadow-2xl relative">
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-mono text-gray-300 ml-2">Enterprise_Procurement_Workflow.dag</span>
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  STATUS: RUNNING
                </span>
              </div>

              {/* Node Chain Visual */}
              <div className="space-y-4 font-mono text-xs">
                {/* Node 1 */}
                <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-500/40 text-blue-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-blue-400 text-lg">bolt</span>
                    <div>
                      <div className="font-bold">Node #1: Webhook Trigger</div>
                      <div className="text-[10px] text-gray-400">Event: "New Hardware Vendor RFQ Submitted"</div>
                    </div>
                  </div>
                  <span className="text-emerald-400 font-bold">PASSED</span>
                </div>

                {/* Connector Arrow */}
                <div className="flex justify-center my-1 text-gray-500">
                  <span className="material-symbols-outlined">south</span>
                </div>

                {/* Node 2 */}
                <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-500/40 text-purple-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-purple-400 text-lg">psychology</span>
                    <div>
                      <div className="font-bold">Node #2: Procurement Agent Node</div>
                      <div className="text-[10px] text-gray-400">Action: Synthesise RFQ Scoring Matrix</div>
                    </div>
                  </div>
                  <span className="text-emerald-400 font-bold">PASSED</span>
                </div>

                {/* Connector Arrow */}
                <div className="flex justify-center my-1 text-gray-500">
                  <span className="material-symbols-outlined">south</span>
                </div>

                {/* Node 3 */}
                <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 text-amber-200 flex items-center justify-between shadow-lg shadow-amber-500/10">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-amber-400 text-lg">verified_user</span>
                    <div>
                      <div className="font-bold">Node #3: Human Approval Policy</div>
                      <div className="text-[10px] text-amber-300 font-semibold">Requires Approval for Payouts &gt; $5,000</div>
                    </div>
                  </div>
                  <span className="text-amber-400 font-bold animate-pulse">PENDING_REVIEW</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── MODEL CONTEXT PROTOCOL (MCP) GATEWAY ── */}
      <section id="mcp" className="py-24 border-b border-white/10 relative">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs text-blue-400 font-mono uppercase tracking-widest font-bold block mb-3">Model Context Protocol</span>
            <h2 className="text-4xl font-extrabold text-white mb-4">FastMCP Universal Tool Surface</h2>
            <p className="text-gray-400 text-base">
              Standardized Model Context Protocol (FastMCP) over Streamable HTTP empowers AI agents to execute actions across external software with strict Pydantic argument validation and pre-execution safety gates.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Tool Cards */}
            <div className="lg:col-span-5 space-y-4">
              {Object.keys(mcpTools).map((key) => {
                const tool = mcpTools[key];
                const isActive = activeMcpTool === key;
                return (
                  <div
                    key={key}
                    onClick={() => setActiveMcpTool(key)}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      isActive
                        ? 'bg-blue-600/15 border-blue-500 text-white shadow-xl shadow-blue-500/10'
                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-semibold text-blue-400 uppercase tracking-wider">{tool.category}</span>
                      <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-gray-300">{tool.endpoint}</span>
                    </div>
                    <h4 className="text-lg font-bold text-white">{tool.name}</h4>
                  </div>
                );
              })}
            </div>

            {/* Right: Code Surface Inspector */}
            <div className="lg:col-span-7 bg-[#07090E] border border-white/10 rounded-3xl p-6 shadow-2xl font-mono text-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-cyan-400 text-base">terminal</span>
                    <span className="text-gray-200 font-semibold">{mcpTools[activeMcpTool].name} (FastMCP Protocol)</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                    3-STAGE_SAFETY_GATE: VERIFIED
                  </span>
                </div>
                <pre className="text-emerald-300 bg-black/60 p-5 rounded-2xl overflow-x-auto border border-white/5 leading-relaxed">
                  {mcpTools[activeMcpTool].code}
                </pre>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-gray-400 text-[11px]">
                <span>✓ Pydantic Argument Validation</span>
                <span>✓ Allowlist Check</span>
                <span>✓ Pre-Execution Audit Entry</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECURITY, GOVERNANCE & POSTGRESQL RLS ── */}
      <section id="security" className="py-24 border-b border-white/10 relative">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs text-blue-400 font-mono uppercase tracking-widest font-bold block mb-3">Enterprise Governance</span>
            <h2 className="text-4xl font-extrabold text-white mb-4">PostgreSQL Row-Level Security (RLS) & Isolation</h2>
            <p className="text-gray-400 text-base">
              Data isolation is enforced natively inside PostgreSQL policies via session-scoped <code className="text-blue-400">SET app.tenant_id</code> variables on every query, preventing cross-tenant data leak risks at the database level.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/10">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-2xl">shield</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">PostgreSQL Native RLS</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                PostgreSQL natively rejects unauthorized tenant reads/writes regardless of backend application logic or API vulnerabilities.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/10">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-2xl">key</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Inter-Service JWT Auth</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Node.js API Gateway and Python Agent Microservice authenticate using internal secret headers (<code className="text-purple-300">X-Internal-Token</code>) and signed JWT claims.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/10">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-2xl">visibility</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Fire-and-Forget Audit Logs</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Every agent thought step, document upload, vector search hit, tool execution, and human approval decision is recorded in an immutable audit trail.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE ROI & PRODUCTIVITY CALCULATOR ── */}
      <section id="calculator" className="py-24 border-b border-white/10 relative">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs text-blue-400 font-mono uppercase tracking-widest font-bold block mb-3">Efficiency Impact</span>
            <h2 className="text-4xl font-extrabold text-white mb-4">Calculate Your Enterprise ROI</h2>
            <p className="text-gray-400 text-base">
              Adjust your team size and estimated manual task hours below to visualize monthly time savings and operational cost reductions.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 bg-white/[0.02] border border-white/10 rounded-3xl p-8 lg:p-12 backdrop-blur-xl shadow-2xl">
            {/* Sliders */}
            <div className="lg:col-span-7 space-y-8">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-semibold text-white">Enterprise Team Size (Employees)</label>
                  <span className="text-lg font-bold font-mono text-blue-400">{teamSize} Employees</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="5"
                  value={teamSize}
                  onChange={(e) => setTeamSize(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-semibold text-white">Weekly Hours Spent on Repetitive Workflows per Employee</label>
                  <span className="text-lg font-bold font-mono text-blue-400">{hoursPerWeek} Hours / Week</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="30"
                  step="1"
                  value={hoursPerWeek}
                  onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-500/20 text-xs text-blue-300 leading-relaxed">
                💡 Calculations assume average enterprise employee operational cost of $65/hr across Support, HR, Procurement, and Finance workflows.
              </div>
            </div>

            {/* Calculated Output Display */}
            <div className="lg:col-span-5 bg-gradient-to-br from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-blue-500/30 rounded-3xl p-8 flex flex-col justify-between shadow-xl">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-blue-300 font-bold mb-6">Projected Enterprise Savings</div>
                
                <div className="mb-6">
                  <div className="text-sm text-gray-300 mb-1">Monthly Hours Reclaimed</div>
                  <div className="text-4xl font-extrabold font-mono text-white">
                    {calculatedHoursSaved.toLocaleString()} <span className="text-lg font-normal text-blue-400">hrs/mo</span>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="text-sm text-gray-300 mb-1">Estimated Annual Cost Reduction</div>
                  <div className="text-4xl font-extrabold font-mono text-emerald-400">
                    ${calculatedCostSavings.toLocaleString()} <span className="text-lg font-normal text-emerald-300">/year</span>
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-300 mb-1">Automated Multi-Agent Cycles</div>
                  <div className="text-2xl font-bold font-mono text-purple-300">
                    {calculatedWorkflows.toLocaleString()} <span className="text-xs text-gray-400">cycles/mo</span>
                  </div>
                </div>
              </div>

              <Link
                href="/signup"
                className="mt-8 w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-center transition-all shadow-lg shadow-blue-500/30 block"
              >
                Claim Your Enterprise Productivity Boost
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING SECTION ── */}
      <section id="pricing" className="py-24 border-b border-white/10 relative">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs text-blue-400 font-mono uppercase tracking-widest font-bold block mb-3">Transparent Pricing</span>
            <h2 className="text-4xl font-extrabold text-white mb-4">Choose Your Enterprise Plan</h2>
            <p className="text-gray-400 text-base">
              Start with a 7-day free trial on any plan. Scale your AI workforce seamlessly as your enterprise grows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Basic Plan */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 transition-all duration-300 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-2xl">rocket_launch</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Basic</h3>
              <p className="text-gray-400 text-sm mb-6 h-10">Essential AI agents for small teams.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-display-lg text-4xl font-extrabold text-white">$50</span>
                <span className="font-body-md text-sm text-gray-400">/ month</span>
              </div>
              <div className="space-y-4 mb-8">
                <div className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">Included Agents:</div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-blue-400 text-sm">check_circle</span> Customer Support Agent
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-blue-400 text-sm">check_circle</span> HR Support Agent
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-blue-400 text-sm">check_circle</span> PM Agent
                </div>
              </div>
              <Link href="/signup" className="block w-full py-3.5 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-center hover:bg-white/10 transition-colors">
                Start 7-Day Free Trial
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="bg-blue-900/10 border border-blue-500/50 rounded-2xl p-8 transition-all duration-300 relative shadow-2xl shadow-blue-500/20 scale-105 z-10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs font-bold rounded-full shadow-lg">
                Most Popular
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/50 text-blue-300 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-2xl">auto_awesome</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
              <p className="text-gray-300 text-sm mb-6 h-10">Advanced automation & developer tools.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-display-lg text-4xl font-extrabold text-white">$75</span>
                <span className="font-body-md text-sm text-gray-400">/ month</span>
              </div>
              <div className="space-y-4 mb-8">
                <div className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">Included Agents:</div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-blue-400 text-sm">expand_circle_right</span> Everything in Basic
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-blue-400 text-sm">check_circle</span> Coding Agent
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-blue-400 text-sm">check_circle</span> Workflow Builder Agent
                </div>
              </div>
              <Link href="/signup" className="block w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl text-center hover:from-blue-500 hover:to-indigo-500 transition-colors shadow-lg shadow-blue-500/25">
                Start 7-Day Free Trial
              </Link>
            </div>

            {/* Enterprise Plan */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 transition-all duration-300 hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/10">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-2xl">corporate_fare</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Enterprise</h3>
              <p className="text-gray-400 text-sm mb-6 h-10">Full AI workforce for enterprise ops.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-display-lg text-4xl font-extrabold text-white">$110</span>
                <span className="font-body-md text-sm text-gray-400">/ month</span>
              </div>
              <div className="space-y-4 mb-8">
                <div className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">Included Agents:</div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-amber-400 text-sm">expand_circle_right</span> Everything in Pro
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-amber-400 text-sm">check_circle</span> Inbound Sales Agent
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-amber-400 text-sm">check_circle</span> Procurement & Finance
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="material-symbols-outlined text-amber-400 text-sm">check_circle</span> Analytics Agent
                </div>
              </div>
              <Link href="/signup" className="block w-full py-3.5 bg-white/5 border border-white/10 text-white font-bold rounded-xl text-center hover:bg-white/10 transition-colors">
                Start 7-Day Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ACCORDION ── */}
      <section id="faq" className="py-24 border-b border-white/10 relative">
        <div className="max-w-[1000px] mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs text-blue-400 font-mono uppercase tracking-widest font-bold block mb-3">Questions & Answers</span>
            <h2 className="text-4xl font-extrabold text-white mb-4">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: 'How does PostgreSQL Row-Level Security (RLS) guarantee tenant isolation?',
                a: 'Every database query issued by the Express backend executes within a PostgreSQL transaction where session context is explicitly set using "SET app.tenant_id = \'...\'". Native PostgreSQL security policies filter all SELECT, INSERT, UPDATE, and DELETE queries at the database layer, rendering cross-tenant data leakage impossible even in the event of an application error.'
              },
              {
                q: 'What is Model Context Protocol (MCP) and how does FastMCP integrate?',
                a: 'Model Context Protocol (MCP) is an open standard designed by Anthropic for cleanly connecting AI models to external tools and data sources. Our platform utilizes FastMCP over Streamable HTTP to bind Gmail, Stripe, GitHub, Qdrant, and PostgreSQL tools with strict Pydantic argument validation and 3-stage safety gates.'
              },
              {
                q: 'Can human reviewers intervene before an agent executes high-risk actions?',
                a: 'Yes! The platform features built-in Human-in-the-Loop (HITL) approval checkpoints. Any high-risk operation—such as payment disbursements above set financial thresholds, external outbound communications, or contract finalizations—intercepts execution and enters an approval queue for reviewer authorization.'
              },
              {
                q: 'Which LLMs and Embedding providers are supported?',
                a: 'The platform natively integrates Google Gemini 2.5 Flash / Embedding-001, OpenRouter (GPT-4o-mini), and local Ollama models (such as Llama 3.2), giving enterprise tenants total flexibility over latency, cost, and data residency.'
              }
            ].map((faq, idx) => {
              const isOpen = expandedFaq === idx;
              return (
                <div
                  key={idx}
                  className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : idx)}
                    className="w-full p-6 text-left font-bold text-lg text-white flex justify-between items-center gap-4 hover:bg-white/[0.02]"
                  >
                    <span>{faq.q}</span>
                    <span className="material-symbols-outlined text-blue-400 transition-transform duration-300">
                      {isOpen ? 'remove' : 'add'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-6 text-gray-300 text-sm leading-relaxed border-t border-white/5 pt-4">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CALL TO ACTION FOOTER ── */}
      <footer className="py-20 bg-[#07090E] border-t border-white/10 relative">
        <div className="max-w-[1440px] mx-auto px-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-600/15 border border-blue-500/40 flex items-center justify-center text-blue-400 mx-auto mb-6 shadow-xl shadow-blue-500/10">
            <span className="material-symbols-outlined text-3xl">hexagon</span>
          </div>

          <h2 className="text-4xl font-black text-white mb-4">
            Ready to Automate Your Enterprise Workforce?
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-10">
            Create your tenant workspace in seconds with automated internal knowledge base onboarding.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-16">
            <Link
              href="/signup"
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl hover:brightness-110 transition-all shadow-xl shadow-blue-600/25 border border-blue-400/30"
            >
              Sign Up For Free Workspace
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-2xl hover:bg-white/10 transition-colors"
            >
              Sign In to Existing Workspace
            </Link>
          </div>

          <div className="border-t border-white/10 pt-8 text-gray-500 text-xs flex flex-col sm:flex-row justify-between items-center gap-4">
            <p>© {new Date().getFullYear()} Enterprise AI Workflow Platform. Built with LangGraph, FastMCP & PostgreSQL RLS.</p>
            <div className="flex flex-wrap justify-center sm:justify-end gap-6 text-gray-400 font-medium">
              <a href="#agents" className="hover:text-blue-400 transition-colors">AI Agents</a>
              <a href="#workflow" className="hover:text-blue-400 transition-colors">Visual Canvas</a>
              <a href="#mcp" className="hover:text-blue-400 transition-colors">MCP Protocol</a>
              <a href="#security" className="hover:text-blue-400 transition-colors">PostgreSQL RLS</a>
              <Link href="/terms" className="hover:text-blue-400 transition-colors">Terms of Service</Link>
              <Link href="/privacy" className="hover:text-blue-400 transition-colors">Privacy Policy</Link>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
