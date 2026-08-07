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
      <header className="header-bar">
        <div className="header-container">
          <Link href="/" className="logo-brand">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">Tenant Control Panel</span>
          </Link>
          
          <nav className="header-nav">
            <Link href="/" className="nav-link">
              📊 Overview
            </Link>

            <Link href="/chat" className="nav-link">
              💬 Chat Histories
            </Link>

            <Link href="/widget-setup" className="nav-link">
              🧩 Widget Setup
            </Link>

            <Link href="/mcp" className="nav-link admin-nav-link">
              🔌 MCP Tools
            </Link>

            <Link href="/admin/tools" className="nav-link admin-nav-link">
              🔒 Centralized Gateway
            </Link>


            {isAdmin && (
              <Link href="/users" className="nav-link admin-nav-link">
                👥 Team Users
              </Link>
            )}

            <button
              onClick={() => setIsDocModalOpen(true)}
              className="docs-nav-btn"
            >
              📁 Documents
            </button>

            <span className="badge-status">
              <span className="status-dot"></span>
              Agent Active
            </span>

            {user && (
              <div className="user-profile">
                <span className="user-email">👤 {user.email}</span>
                {user.role && (
                  <span className={`user-role ${isAdmin ? 'role-admin' : 'role-reviewer'}`}>
                    {user.role}
                  </span>
                )}
                <button onClick={logout} className="logout-btn">
                  Log Out
                </button>
              </div>
            )}
          </nav>
        </div>
        <style jsx>{`
          .header-bar {
            background: var(--color-surface);
            border-bottom: 1px solid var(--color-border);
            padding: 1rem 1.5rem;
            position: sticky;
            top: 0;
            z-index: 50;
          }
          .header-container {
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .logo-brand {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            text-decoration: none;
            color: var(--color-text);
            font-weight: 700;
            font-size: 1.15rem;
            letter-spacing: -0.02em;
          }
          .logo-icon {
            font-size: 1.25rem;
            background: var(--color-bg);
            padding: 0.35rem 0.5rem;
            border-radius: var(--radius-sm);
            border: 1px solid var(--color-border);
            box-shadow: var(--shadow-sm);
          }
          .header-nav {
            display: flex;
            align-items: center;
            gap: 1rem;
          }
          .nav-link {
            text-decoration: none;
            color: var(--color-muted);
            font-weight: 600;
            font-size: 0.875rem;
            padding: 0.5rem 0.75rem;
            border-radius: var(--radius-sm);
            transition: all 0.2s ease;
          }
          .nav-link:hover {
            color: var(--color-text);
            background: var(--color-bg);
          }
          .admin-nav-link {
            color: var(--color-primary);
          }
          .admin-nav-link:hover {
            color: var(--color-primary-hover);
          }
          .docs-nav-btn {
            background: var(--color-bg);
            color: var(--color-text);
            border: 1px solid var(--color-border);
            padding: 0.5rem 1rem;
            border-radius: var(--radius-sm);
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.2s ease;
          }
          .docs-nav-btn:hover {
            background: var(--color-secondary);
            border-color: #d1d5db;
          }
          .badge-status {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.4rem 0.85rem;
            background: #f0fdf4;
            color: #166534;
            font-size: 0.85rem;
            font-weight: 600;
            border-radius: 20px;
            border: 1px solid #bbf7d0;
          }
          .status-dot {
            width: 8px;
            height: 8px;
            background: #22c55e;
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
          }
          .user-profile {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.875rem;
            color: var(--color-text);
            padding-left: 1rem;
            border-left: 1px solid var(--color-border);
          }
          .user-email {
            font-weight: 600;
            color: var(--color-text);
          }
          .user-role {
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            padding: 0.2rem 0.5rem;
            border-radius: var(--radius-sm);
          }
          .role-admin {
            background: #e0e7ff;
            color: #4338ca;
          }
          .role-reviewer {
            background: #fefce8;
            color: #a16207;
          }
          .logout-btn {
            background: var(--color-surface);
            color: #dc2626;
            border: 1px solid var(--color-border);
            padding: 0.4rem 0.85rem;
            border-radius: var(--radius-sm);
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .logout-btn:hover {
            background: #fef2f2;
            border-color: #fca5a5;
          }
        `}</style>
      </header>

      <DocumentModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
      />
    </>
  );
}
