'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#07090E] text-gray-200 font-sans antialiased flex flex-col justify-between relative overflow-hidden selection:bg-blue-500/30 selection:text-blue-200">
      {/* Background Glow Overlay */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-indigo-600/10 blur-[140px] rounded-full pointer-events-none"></div>
      <div className="absolute top-1/3 left-0 w-[400px] h-[400px] bg-blue-600/5 blur-[150px] rounded-full pointer-events-none"></div>

      {/* Header / Navbar */}
      <header className="border-b border-white/10 bg-[#07090E]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform shadow-lg shadow-blue-500/10">
              <span className="material-symbols-outlined text-2xl">hexagon</span>
            </div>
            <span className="font-extrabold text-xl text-white tracking-tight">Enterprise AI</span>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:brightness-110 transition-all text-xs shadow-md shadow-blue-600/20"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[960px] mx-auto px-6 py-16 relative z-10 flex-1">
        {/* Badge & Title Header */}
        <div className="mb-12 text-center sm:text-left border-b border-white/10 pb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-4 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
            <span>Enterprise Service Terms & Conditions</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">
            Terms of Service
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-2xl leading-relaxed">
            Effective Date: <strong className="text-gray-200">September 1, 2026</strong> &nbsp;|&nbsp; Last Updated: <strong className="text-gray-200">September 2026</strong>
          </p>
        </div>

        {/* Legal Sections */}
        <div className="space-y-12 text-gray-300 text-sm sm:text-base leading-relaxed">
          
          {/* Section 1 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-indigo-400">gavel</span>
              <h2>1. Agreement & Enterprise Workspace Registration</h2>
            </div>
            <p>
              These Terms of Service ("Terms") govern your access to and use of the Enterprise AI Workflow Platform ("Platform"), operated by Enterprise AI Platform Inc. By creating an enterprise workspace account, executing a subscription agreement, or using any autonomous AI agent features, you agree to be bound by these Terms on behalf of your organization.
            </p>
            <p>
              You represent and warrant that you have full legal authority to bind your company or entity to these Terms. If you do not agree, you must not access or use the Platform.
            </p>
          </section>

          {/* Section 2 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-blue-400">smart_toy</span>
              <h2>2. Multi-Agent Workforce Services</h2>
            </div>
            <p>
              The Platform provides stateful autonomous AI workforce orchestration across enterprise domains including Sales SDR outreach, HR talent parsing, Procurement RFQ negotiation, Finance ledger automation, Coding AST audits, and Customer Support RAG.
            </p>
            <p>
              Each autonomous agent operates using stateful LangGraph state machines bound to specialized Model Context Protocol (FastMCP) tools and database integrations.
            </p>
          </section>

          {/* Section 3 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-amber-400">verified_user</span>
              <h2>3. Human-in-the-Loop (HITL) Governance & Responsibilities</h2>
            </div>
            <p>
              To maintain strict operational safety, high-risk actions (including financial disbursements exceeding policy caps, external contract executions, and mass outbound campaigns) trigger automated <strong className="text-amber-300">Human-in-the-Loop (HITL)</strong> approval checkpoints.
            </p>
            <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl text-amber-200 text-xs leading-relaxed">
              <strong>Human Reviewer Obligation:</strong> Authorized human managers within your organization are responsible for reviewing and approving queued pending actions. Enterprise AI Platform Inc. is not liable for operational consequences resulting from human reviewer approvals.
            </div>
          </section>

          {/* Section 4 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-emerald-400">payments</span>
              <h2>4. Subscription, Billing & Paddle Merchant Terms</h2>
            </div>
            <p>
              Subscriptions (Basic, Pro, Enterprise) are billed on a recurring monthly or annual basis. Payments are processed securely via our Merchant of Record, <strong className="text-emerald-300">Paddle.com</strong>.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-300">
              <li><strong className="text-white">Free Trial Period:</strong> If applicable, new tenant workspaces receive a 7-day free trial. If not canceled prior to trial expiration, the selected tier plan will be billed automatically.</li>
              <li><strong className="text-white">Cancellation:</strong> You may cancel your subscription at any time via the billing portal. Access remains active through the end of the paid billing cycle.</li>
              <li><strong className="text-white">Taxes & Fees:</strong> Paddle handles applicable sales taxes, VAT, and invoice processing.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-rose-400">block</span>
              <h2>5. Acceptable Use & Security Obligations</h2>
            </div>
            <p>You agree not to use the Platform or any AI Agent to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-300">
              <li>Attempt cross-tenant data access or breach PostgreSQL Row-Level Security isolation.</li>
              <li>Generate unauthorized spam email outreach, unlawful phishing, or fraudulent financial documents.</li>
              <li>Reverse engineer or extract underlying system prompts, FastMCP tool definitions, or agent graph code.</li>
              <li>Share user credentials outside authorized enterprise workspace administrators.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-purple-400">copyright</span>
              <h2>6. Enterprise Data Ownership & IP Rights</h2>
            </div>
            <p>
              You retain all ownership rights, intellectual property, and title to all data, documents, and inputs uploaded to your tenant workspace ("Customer Data").
            </p>
            <p>
              All output generated by the AI workforce for your organization is owned by your enterprise. Enterprise AI Platform Inc. retains ownership of the underlying software architecture, multi-agent frameworks, and FastMCP protocol surfaces.
            </p>
          </section>

          {/* Section 7 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-cyan-400">warning</span>
              <h2>7. Limitation of Liability</h2>
            </div>
            <p>
              To the maximum extent permitted by law, Enterprise AI Platform Inc. shall not be liable for any indirect, incidental, special, or consequential damages arising from autonomous AI agent actions, third-party API availability, or human reviewer decisions. Our aggregate liability shall not exceed the total fees paid by your enterprise in the twelve (12) months preceding the claim.
            </p>
          </section>

          {/* Section 8 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-blue-400">mail</span>
              <h2>8. Governing Law & Support Contact</h2>
            </div>
            <p>
              These Terms are governed by state and federal laws without regard to conflict of law principles. For legal inquiries or support regarding these terms:
            </p>
            <div className="p-4 bg-blue-950/20 border border-blue-500/30 rounded-xl text-xs space-y-1 font-mono text-blue-300">
              <p>Email: legal@enterprise-ai-platform.com</p>
              <p>Legal & Governance Office | Enterprise AI Platform Inc.</p>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#07090E] py-8 text-center text-xs text-gray-500 relative z-10">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>© {new Date().getFullYear()} Enterprise AI Platform. All rights reserved.</p>
          <div className="flex gap-6 text-gray-400">
            <Link href="/" className="hover:text-blue-400 transition-colors">Home</Link>
            <Link href="/privacy" className="hover:text-blue-400 transition-colors">Privacy Policy</Link>
            <Link href="/signup" className="hover:text-blue-400 transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
