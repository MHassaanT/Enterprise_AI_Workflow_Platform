'use client';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import ProjectsTab from './ProjectsTab';

export default function PMAgentPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="border-b border-outline-variant bg-surface px-lg py-md flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors flex items-center">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary">account_tree</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">PM Agent</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Project Operations, Team Roster & Pacing Engine</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Projects Tab Content */}
        <main className="flex-1 flex overflow-hidden">
          <ProjectsTab />
        </main>
      </div>
    </AuthGuard>
  );
}
