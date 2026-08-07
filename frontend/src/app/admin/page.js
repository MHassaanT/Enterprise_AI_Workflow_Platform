'use client';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

export default function AdminHubPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <main className="max-w-container-max mx-auto px-lg py-xl">
          <header className="mb-xl border-b border-outline-variant pb-lg">
            <span className="font-label-md text-label-md text-primary bg-primary-container/10 px-3 py-1 rounded-full border border-primary/20 inline-block mb-3">
              🛡️ Admin Central Hub
            </span>
            <h1 className="font-display-lg text-display-lg text-on-surface mb-2">
              System Administration & Control Center
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
              Access tool registries, encryption key storage, team provisioning, and security policy rules.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
            {/* Card 1: Tool Registry & Credentials */}
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-md flex flex-col justify-between hover:border-outline transition-colors">
              <div className="space-y-md">
                <div className="flex items-center gap-3">
                  <span className="text-3xl bg-surface-container p-3 rounded-lg border border-outline-variant">🔒</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">MCP Gateway & Tool Registry</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">Credentials & Vendor Adapters</span>
                  </div>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Configure tool bindings for Airtable, Resend, SafePay, and Supabase. Manage per-agent tool allowlists and AES-256-GCM encrypted API key storage.
                </p>
              </div>
              <Link href="/admin/tools" className="inline-block w-full text-center py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors shadow-sm mt-4">
                Open MCP Tool Gateway ➔
              </Link>
            </div>

            {/* Card 2: Team Roster & Provisioning */}
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-md flex flex-col justify-between hover:border-outline transition-colors">
              <div className="space-y-md">
                <div className="flex items-center gap-3">
                  <span className="text-3xl bg-surface-container p-3 rounded-lg border border-outline-variant">👥</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">Team Roster & Access Control</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">User Provisioning & Roles</span>
                  </div>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Provision discrete login credentials for team reviewers with restricted permissions for human approval queues and chat history audits.
                </p>
              </div>
              <Link href="/users" className="inline-block w-full text-center py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors shadow-sm mt-4">
                Manage Team Accounts ➔
              </Link>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
