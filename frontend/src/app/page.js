'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/api';

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      setIsLoggedIn(true);
      setUser(getUser());
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased selection:bg-primary/30 selection:text-primary">
      {/* ── TOP PUBLIC NAVBAR ── */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/60">
        <div className="max-w-container-max mx-auto px-lg h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-11 w-11 rounded-xl bg-primary-container/20 border border-primary/40 flex items-center justify-center text-primary group-hover:border-primary transition-all group-hover:scale-105 shadow-sm">
              <span className="material-symbols-outlined text-2xl">hexagon</span>
            </div>
            <div>
              <span className="font-display-lg text-headline-md font-extrabold text-on-surface tracking-tight">Enterprise AI</span>
              <span className="block font-label-md text-label-md text-primary font-mono font-medium">Workforce Platform</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 font-label-md text-label-md text-on-surface-variant font-medium">
            <a href="#agents" className="hover:text-primary transition-colors">AI Agents</a>
            <a href="#workflow" className="hover:text-primary transition-colors">Workflow Engine</a>
            <a href="#mcp" className="hover:text-primary transition-colors">MCP Protocol</a>
            <a href="#security" className="hover:text-primary transition-colors">Security & Governance</a>
          </nav>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="px-lg py-2.5 bg-primary text-on-primary font-label-md text-label-md font-bold rounded-lg hover:bg-primary-container transition-all shadow-md flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">dashboard</span>
                Go to Control Panel
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-md py-2.5 text-on-surface hover:text-primary font-label-md text-label-md font-semibold transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="px-lg py-2.5 bg-primary text-on-primary font-label-md text-label-md font-bold rounded-lg hover:bg-primary-container transition-all shadow-md shadow-primary/10 flex items-center gap-2"
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
      <section className="relative pt-20 pb-28 overflow-hidden">
        {/* Ambient Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-primary/15 blur-[140px] rounded-full pointer-events-none"></div>
        <div className="absolute top-1/3 right-10 w-[400px] h-[300px] bg-tertiary/10 blur-[130px] rounded-full pointer-events-none"></div>

        <div className="max-w-container-max mx-auto px-lg text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-container/20 border border-primary/30 text-primary font-label-md text-label-md font-semibold mb-8 animate-fade-in shadow-sm">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span>Next-Generation Multi-Agent Enterprise Orchestration</span>
          </div>

          <h1 className="font-display-lg text-5xl md:text-6xl lg:text-7xl font-extrabold text-on-surface tracking-tight max-w-5xl mx-auto leading-[1.15] mb-8">
            Deploy Autonomous <span className="bg-gradient-to-r from-primary via-blue-400 to-tertiary bg-clip-text text-transparent">AI Agents</span> Across Your Enterprise
          </h1>

          <p className="font-body-lg text-xl text-on-surface-variant max-w-3xl mx-auto leading-relaxed mb-10">
            Unify Sales SDR outreach, HR talent screening, Procurement negotiations, and Financial reconciliation under one secure, human-governed AI Workforce platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-xl py-4 bg-primary text-on-primary font-label-md text-label-md font-bold rounded-xl hover:bg-primary-container transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 text-lg"
            >
              <span>Create Your Workspace</span>
              <span className="material-symbols-outlined">rocket_launch</span>
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-xl py-4 bg-surface-container-high border border-outline-variant text-on-surface font-label-md text-label-md font-semibold rounded-xl hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-2 text-lg"
            >
              <span className="material-symbols-outlined">login</span>
              <span>Sign In to Existing Tenant</span>
            </Link>
          </div>

          {/* Interactive Feature Cards Metric Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md max-w-4xl mx-auto p-4 bg-surface-container-low/80 backdrop-blur-md border border-outline-variant/80 rounded-2xl shadow-2xl">
            <div className="p-4 border-r border-outline-variant/40 last:border-0">
              <div className="font-display-lg text-3xl font-black text-primary mb-1">10x</div>
              <div className="font-label-md text-label-md text-on-surface-variant font-medium">Faster Execution</div>
            </div>
            <div className="p-4 border-r border-outline-variant/40 last:border-0">
              <div className="font-display-lg text-3xl font-black text-tertiary mb-1">100%</div>
              <div className="font-label-md text-label-md text-on-surface-variant font-medium">Human Approval Safety</div>
            </div>
            <div className="p-4 border-r border-outline-variant/40 last:border-0">
              <div className="font-display-lg text-3xl font-black text-emerald-400 mb-1">MCP Native</div>
              <div className="font-label-md text-label-md text-on-surface-variant font-medium">Model Context Protocol</div>
            </div>
            <div className="p-4">
              <div className="font-display-lg text-3xl font-black text-secondary mb-1">RLS Protected</div>
              <div className="font-label-md text-label-md text-on-surface-variant font-medium">Tenant Data Isolation</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MULTI-AGENT DOMAIN AGENTS ── */}
      <section id="agents" className="py-24 bg-surface-container-lowest/50 border-y border-outline-variant/60">
        <div className="max-w-container-max mx-auto px-lg">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="font-label-md text-label-md text-primary font-mono uppercase tracking-widest font-bold block mb-3">Specialized AI Workforce</span>
            <h2 className="font-display-lg text-4xl font-extrabold text-on-surface mb-4">Autonomous Agents Built for Every Department</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Each AI agent executes domain-specific LangGraph stateful flows equipped with dedicated tools, vector RAG knowledge retrieval, and audit logging.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
            {/* Sales SDR Agent */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-xl hover:border-primary/60 transition-all group flex flex-col justify-between shadow-sm">
              <div>
                <div className="w-14 h-14 rounded-xl bg-tertiary-container/20 border border-tertiary/30 text-tertiary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">trending_up</span>
                </div>
                <h3 className="font-headline-md text-2xl font-bold text-on-surface mb-3">AI Sales SDR Agent</h3>
                <p className="font-body-md text-on-surface-variant leading-relaxed mb-6">
                  Discovers targeted company leads via Hunter.io, builds ICP-grounded prospect copy, quotes customized pricing tier packages, and manages outbound campaigns.
                </p>
              </div>
              <div className="pt-4 border-t border-outline-variant/40 flex items-center justify-between">
                <span className="font-label-md text-label-md text-tertiary font-semibold">Lead Gen & Copywriting</span>
                <span className="material-symbols-outlined text-tertiary text-sm">arrow_forward</span>
              </div>
            </div>

            {/* HR Recruiting Agent */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-xl hover:border-primary/60 transition-all group flex flex-col justify-between shadow-sm">
              <div>
                <div className="w-14 h-14 rounded-xl bg-primary-container/20 border border-primary/30 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">groups</span>
                </div>
                <h3 className="font-headline-md text-2xl font-bold text-on-surface mb-3">HR & Talent Agent</h3>
                <p className="font-body-md text-on-surface-variant leading-relaxed mb-6">
                  Screens incoming applicant resumes, performs vector semantic candidate ranking against Job Descriptions, and schedules automated interviews.
                </p>
              </div>
              <div className="pt-4 border-t border-outline-variant/40 flex items-center justify-between">
                <span className="font-label-md text-label-md text-primary font-semibold">Recruitment & Scheduling</span>
                <span className="material-symbols-outlined text-primary text-sm">arrow_forward</span>
              </div>
            </div>

            {/* Procurement Agent */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-xl hover:border-primary/60 transition-all group flex flex-col justify-between shadow-sm">
              <div>
                <div className="w-14 h-14 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">shopping_cart</span>
                </div>
                <h3 className="font-headline-md text-2xl font-bold text-on-surface mb-3">Procurement Agent</h3>
                <p className="font-body-md text-on-surface-variant leading-relaxed mb-6">
                  Researches verified vendors, generates structured RFQs, manages email outreach, and synthesizes multi-round price negotiations.
                </p>
              </div>
              <div className="pt-4 border-t border-outline-variant/40 flex items-center justify-between">
                <span className="font-label-md text-label-md text-emerald-400 font-semibold">Vendor Outreach & RFQ</span>
                <span className="material-symbols-outlined text-emerald-400 text-sm">arrow_forward</span>
              </div>
            </div>

            {/* Finance Agent */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-xl hover:border-primary/60 transition-all group flex flex-col justify-between shadow-sm">
              <div>
                <div className="w-14 h-14 rounded-xl bg-secondary-container/20 border border-secondary/30 text-secondary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">payments</span>
                </div>
                <h3 className="font-headline-md text-2xl font-bold text-on-surface mb-3">Finance & Accounting</h3>
                <p className="font-body-md text-on-surface-variant leading-relaxed mb-6">
                  Ingests vendor invoices, reconciles PO line items against general ledgers, enforces department budget caps, and triggers payment requests.
                </p>
              </div>
              <div className="pt-4 border-t border-outline-variant/40 flex items-center justify-between">
                <span className="font-label-md text-label-md text-secondary font-semibold">PO & Ledger Automation</span>
                <span className="material-symbols-outlined text-secondary text-sm">arrow_forward</span>
              </div>
            </div>

            {/* PM & Pacing Agent */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-xl hover:border-primary/60 transition-all group flex flex-col justify-between shadow-sm">
              <div>
                <div className="w-14 h-14 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">account_tree</span>
                </div>
                <h3 className="font-headline-md text-2xl font-bold text-on-surface mb-3">PM & Project Pacing</h3>
                <p className="font-body-md text-on-surface-variant leading-relaxed mb-6">
                  Monitors active team deliverables, detects projects falling behind completion pacing velocity, and dispatches automated reminder check-ins.
                </p>
              </div>
              <div className="pt-4 border-t border-outline-variant/40 flex items-center justify-between">
                <span className="font-label-md text-label-md text-amber-400 font-semibold">Project Health Tracking</span>
                <span className="material-symbols-outlined text-amber-400 text-sm">arrow_forward</span>
              </div>
            </div>

            {/* Customer Support Agent */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-xl hover:border-primary/60 transition-all group flex flex-col justify-between shadow-sm">
              <div>
                <div className="w-14 h-14 rounded-xl bg-cyan-950/40 border border-cyan-800/50 text-cyan-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">forum</span>
                </div>
                <h3 className="font-headline-md text-2xl font-bold text-on-surface mb-3">Support & RAG Assistant</h3>
                <p className="font-body-md text-on-surface-variant leading-relaxed mb-6">
                  Provides 24/7 web widget support powered by vector retrieval memory (RAG) over company knowledge documents with human escalation safety.
                </p>
              </div>
              <div className="pt-4 border-t border-outline-variant/40 flex items-center justify-between">
                <span className="font-label-md text-label-md text-cyan-400 font-semibold">24/7 Support & Vector Search</span>
                <span className="material-symbols-outlined text-cyan-400 text-sm">arrow_forward</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ENGINE & MCP INTEGRATION SECTION ── */}
      <section id="workflow" className="py-24 relative">
        <div className="max-w-container-max mx-auto px-lg">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="font-label-md text-label-md text-primary font-mono uppercase tracking-widest font-bold block mb-3">Visual Automation</span>
              <h2 className="font-display-lg text-4xl font-extrabold text-on-surface mb-6 leading-tight">
                Build Multi-Agent Workflows With Universal Tools
              </h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant mb-8 leading-relaxed">
                Connect external services seamlessly through Model Context Protocol (MCP). Chain AI reasoning steps, define approval policies, and monitor real-time execution logs.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant">
                  <span className="material-symbols-outlined text-primary text-2xl mt-0.5">hub</span>
                  <div>
                    <h4 className="font-headline-md text-lg font-bold text-on-surface mb-1">Model Context Protocol (MCP)</h4>
                    <p className="font-body-md text-on-surface-variant">Connect Gmail, Stripe, GitHub, Vercel, Airtable, and custom FastMCP servers effortlessly.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant">
                  <span className="material-symbols-outlined text-tertiary text-2xl mt-0.5">gavel</span>
                  <div>
                    <h4 className="font-headline-md text-lg font-bold text-on-surface mb-1">Human-in-the-Loop Safeguards</h4>
                    <p className="font-body-md text-on-surface-variant">High-risk agent operations (payments, contract approvals, outreach dispatches) require reviewer authorization.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-lg shadow-2xl relative">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-error"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                </div>
                <span className="font-mono-sm text-mono-sm text-on-surface-variant">workflow_dag.json</span>
              </div>
              <pre className="font-mono-sm text-mono-sm text-primary bg-surface p-4 rounded-xl overflow-x-auto border border-outline-variant/60 leading-relaxed">
{`{
  "workflow": "Enterprise Procurement & Financial Audit",
  "nodes": [
    { "id": "1", "type": "agent", "name": "Procurement Vendor Research" },
    { "id": "2", "type": "agent", "name": "RFQ Negotiation Synthesis" },
    { "id": "3", "type": "checkpoint", "name": "Human Approval Policy" },
    { "id": "4", "type": "mcp_tool", "name": "Stripe PO Disbursement" }
  ],
  "status": "active"
}`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── CALL TO ACTION FOOTER ── */}
      <footer className="bg-surface-container-low border-t border-outline-variant py-16">
        <div className="max-w-container-max mx-auto px-lg text-center">
          <div className="h-12 w-12 rounded-2xl bg-primary-container/20 border border-primary/40 flex items-center justify-center text-primary mx-auto mb-6">
            <span className="material-symbols-outlined text-3xl">hexagon</span>
          </div>
          <h2 className="font-display-lg text-3xl font-extrabold text-on-surface mb-4">Ready to Automate Your Enterprise Workforce?</h2>
          <p className="font-body-lg text-on-surface-variant max-w-xl mx-auto mb-8">
            Create your company workspace in seconds with automated Crawl4AI website parsing.
          </p>

          <div className="flex justify-center gap-4 mb-12">
            <Link
              href="/signup"
              className="px-xl py-3.5 bg-primary text-on-primary font-label-md text-label-md font-bold rounded-xl hover:bg-primary-container transition-all shadow-lg shadow-primary/20"
            >
              Sign Up Now
            </Link>
            <Link
              href="/login"
              className="px-xl py-3.5 bg-surface-container-high border border-outline-variant text-on-surface font-label-md text-label-md font-semibold rounded-xl hover:bg-surface-container-highest transition-colors"
            >
              Sign In
            </Link>
          </div>

          <div className="border-t border-outline-variant/60 pt-8 text-on-surface-variant font-label-md text-label-md flex flex-col sm:flex-row justify-between items-center gap-4">
            <p>© {new Date().getFullYear()} Enterprise AI Workflow Platform. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#agents" className="hover:text-primary transition-colors">Agents</a>
              <a href="#workflow" className="hover:text-primary transition-colors">Workflows</a>
              <a href="#mcp" className="hover:text-primary transition-colors">MCP Protocol</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
