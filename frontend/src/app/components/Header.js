'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getUser, logout } from '@/lib/api';
import DocumentModal from './DocumentModal';

export default function Header() {
  const [user, setUser] = useState(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <>
      <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-outline-variant px-lg py-md">
        <div className="max-w-container-max mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <span className="p-2 bg-surface-container border border-outline-variant rounded-md text-primary group-hover:border-primary/50 transition-colors">⚡</span>
            <span className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight">Tenant Control Panel</span>
          </Link>
          
          <nav className="flex items-center gap-md">
            <Link href="/" className="px-3 py-1.5 rounded-md font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              📊 Overview
            </Link>

            <Link href="/chat" className="px-3 py-1.5 rounded-md font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              💬 Chat Histories
            </Link>

            <Link href="/widget-setup" className="px-3 py-1.5 rounded-md font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              🧩 Widget Setup
            </Link>

            <Link href="/mcp" className="px-3 py-1.5 rounded-md font-label-md text-label-md text-primary hover:bg-primary-container/10 transition-colors">
              🔌 MCP Tools
            </Link>

            <Link href="/admin/tools" className="px-3 py-1.5 rounded-md font-label-md text-label-md text-primary hover:bg-primary-container/10 transition-colors">
              🔒 Centralized Gateway
            </Link>

            {isAdmin && (
              <Link href="/users" className="px-3 py-1.5 rounded-md font-label-md text-label-md text-primary hover:bg-primary-container/10 transition-colors">
                👥 Team Users
              </Link>
            )}

            <button
              onClick={() => setIsDocModalOpen(true)}
              className="px-3 py-1.5 rounded-md font-label-md text-label-md bg-surface-container border border-outline-variant text-on-surface hover:bg-surface-container-high transition-colors"
            >
              📁 Documents
            </button>

            <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-950/40 text-emerald-400 font-label-md text-label-md rounded-full border border-emerald-800/50">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Agent Active
            </span>

            {user && (
              <div className="flex items-center gap-3 pl-md border-l border-outline-variant">
                <span className="font-label-md text-label-md text-on-surface">👤 {user.email}</span>
                {user.role && (
                  <span className={`px-2 py-0.5 rounded font-mono-sm text-mono-sm font-semibold uppercase ${isAdmin ? 'bg-primary-container/20 text-primary border border-primary/30' : 'bg-tertiary-container/20 text-tertiary border border-tertiary/30'}`}>
                    {user.role}
                  </span>
                )}
                <button onClick={logout} className="px-3 py-1 rounded-md font-label-md text-label-md text-error bg-error-container/20 hover:bg-error-container/40 transition-colors border border-error/30">
                  Log Out
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <DocumentModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
      />
    </>
  );
}
