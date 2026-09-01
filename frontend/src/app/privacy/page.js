'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#07090E] text-gray-200 font-sans antialiased flex flex-col justify-between relative overflow-hidden selection:bg-blue-500/30 selection:text-blue-200">
      {/* Background Glow Overlay */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-blue-600/10 blur-[140px] rounded-full pointer-events-none"></div>
      <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-purple-600/5 blur-[150px] rounded-full pointer-events-none"></div>

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
            <Link href="/terms" className="text-gray-400 hover:text-white transition-colors">
              Terms of Service
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/60 border border-blue-500/30 text-blue-300 text-xs font-semibold mb-4 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
            <span>Enterprise Security & Transparency</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-2xl leading-relaxed">
            Effective Date: <strong className="text-gray-200">September 1, 2026</strong> &nbsp;|&nbsp; Last Updated: <strong className="text-gray-200">September 2026</strong>
          </p>
        </div>

        {/* Legal Sections */}
        <div className="space-y-12 text-gray-300 text-sm sm:text-base leading-relaxed">
          
          {/* Section 1 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-blue-400 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-blue-400">shield</span>
              <h2>1. Commitment to Enterprise Privacy</h2>
            </div>
            <p>
              At Enterprise AI Workflow Platform ("Enterprise AI", "we", "our", or "us"), we prioritize the confidentiality, integrity, and security of tenant data. This Privacy Policy explains how we collect, use, process, and safeguard information when you use our multi-agent workforce orchestration platform, website, and services.
            </p>
            <p>
              By accessing or using our services, you acknowledge that you have read and understood this Privacy Policy.
            </p>
          </section>

          {/* Section 2 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-cyan-400">database</span>
              <h2>2. Information We Collect</h2>
            </div>
            <p>We collect information to provide, secure, and optimize autonomous AI agent workflows across your enterprise:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-300">
              <li>
                <strong className="text-white">Account & Contact Information:</strong> Name, work email address, encrypted password credentials, organization name, industry, and role.
              </li>
              <li>
                <strong className="text-white">Company Profile & Onboarding Data:</strong> Information extracted via Crawl4AI website URL crawling (such as company description, target industry, and team role defaults).
              </li>
              <li>
                <strong className="text-white">Multi-Agent Workflow State & Logs:</strong> Execution traces, human-in-the-loop approval logs, candidate resume vectors (HR agent), vendor RFQ documents (Procurement agent), sales prospect lists (SDR agent), and financial ledgers.
              </li>
              <li>
                <strong className="text-white">Payment & Billing Information:</strong> Payment processor customer identifiers, subscription tier details, and billing history handled securely through our merchant of record, Paddle.
              </li>
              <li>
                <strong className="text-white">Technical & Usage Metadata:</strong> IP addresses, browser types, interaction telemetry, FastMCP tool call metrics, and performance logs.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-emerald-400">lock</span>
              <h2>3. Data Isolation & PostgreSQL Row-Level Security (RLS)</h2>
            </div>
            <p>
              Multi-tenancy isolation is fundamental to our platform design. All tenant workspace data stored in PostgreSQL is protected natively using <strong className="text-emerald-300">Row-Level Security (RLS)</strong>:
            </p>
            <div className="p-4 bg-[#0B0E17] border border-emerald-500/30 rounded-xl text-xs font-mono text-emerald-300 space-y-1">
              <p>-- Native PostgreSQL Session Isolation Policy</p>
              <p>SET LOCAL app.tenant_id = 'tenant_uuid';</p>
              <p>SELECT * FROM agent_execution_logs WHERE tenant_id = current_setting('app.tenant_id');</p>
            </div>
            <p className="text-xs text-gray-400">
              This mechanism guarantees at the database level that no tenant can read, query, or mutate another organization's workspace data.
            </p>
          </section>

          {/* Section 4 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-amber-400">psychology</span>
              <h2>4. How We Use Information & AI Model Boundaries</h2>
            </div>
            <p>We use tenant information exclusively for:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-300">
              <li>Executing stateful LangGraph agent pipelines andFastMCP tool invocations.</li>
              <li>Processing email verifications via Firebase Auth and dispatching transactional notifications.</li>
              <li>Evaluating Human-in-the-Loop (HITL) approval threshold rules.</li>
              <li>Managing subscription status via Paddle webhooks.</li>
            </ul>
            <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl text-amber-200 text-xs leading-relaxed">
              <strong>LLM Data Protection Promise:</strong> Customer enterprise data submitted to AI agent models (such as Google Gemini or OpenRouter APIs) is governed by strict zero-retention enterprise API agreements. Customer data is <strong>never used to train public AI foundation models</strong>.
            </div>
          </section>

          {/* Section 5 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-purple-400">hub</span>
              <h2>5. Third-Party Subprocessors</h2>
            </div>
            <p>To deliver robust enterprise services, we integrate with trusted third-party infrastructure providers:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
                <div className="font-bold text-white mb-1">Paddle.com</div>
                <p className="text-xs text-gray-400">Merchant of Record for subscription payment processing and tax compliance.</p>
              </div>
              <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
                <div className="font-bold text-white mb-1">Firebase (Google Cloud)</div>
                <p className="text-xs text-gray-400">Client authentication, email verification, and secure token management.</p>
              </div>
              <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
                <div className="font-bold text-white mb-1">Hunter.io & Crawl4AI</div>
                <p className="text-xs text-gray-400">Sales SDR lead verification and web extraction services.</p>
              </div>
              <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
                <div className="font-bold text-white mb-1">Qdrant Vector DB</div>
                <p className="text-xs text-gray-400">High-performance vector embeddings for HR candidate matching and Support RAG.</p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-rose-400">folder_delete</span>
              <h2>6. Data Rights & Retention</h2>
            </div>
            <p>
              As an enterprise tenant administrator, you maintain full control over your data. You may request workspace data exports or complete workspace deletion at any time by contacting our privacy team.
            </p>
            <p>
              Upon workspace termination, all PostgreSQL tables, vector embeddings, and cached agent state files are permanently deleted within 30 days.
            </p>
          </section>

          {/* Section 7 */}
          <section className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 font-bold text-lg text-white">
              <span className="material-symbols-outlined text-2xl text-blue-400">mail</span>
              <h2>7. Contact Us</h2>
            </div>
            <p>If you have any questions or privacy concerns regarding this policy, please reach out to us:</p>
            <div className="p-4 bg-blue-950/20 border border-blue-500/30 rounded-xl text-xs space-y-1 font-mono text-blue-300">
              <p>Email: privacy@enterprise-ai-platform.com</p>
              <p>Enterprise Security Office | Enterprise AI Platform Inc.</p>
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
            <Link href="/terms" className="hover:text-blue-400 transition-colors">Terms of Service</Link>
            <Link href="/signup" className="hover:text-blue-400 transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
