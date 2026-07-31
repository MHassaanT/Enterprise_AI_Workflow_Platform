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
            background: #ffffff;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
            padding: 0.85rem 1.5rem;
            position: sticky;
            top: 0;
            z-index: 50;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
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
            gap: 0.6rem;
            text-decoration: none;
            color: #111827;
            font-weight: 700;
            font-size: 1.15rem;
            letter-spacing: -0.02em;
          }
          .logo-icon {
            font-size: 1.25rem;
            background: #eff6ff;
            padding: 0.3rem 0.5rem;
            border-radius: 8px;
            border: 1px solid #dbeafe;
          }
          .header-nav {
            display: flex;
            align-items: center;
            gap: 0.85rem;
          }
          .nav-link {
            text-decoration: none;
            color: #475569;
            font-weight: 600;
            font-size: 0.875rem;
            padding: 0.4rem 0.75rem;
            border-radius: 6px;
            transition: all 0.2s ease;
          }
          .nav-link:hover {
            color: #2563eb;
            background: #f1f5f9;
          }
          .admin-nav-link {
            color: #4f46e5;
          }
          .docs-nav-btn {
            background: #f1f5f9;
            color: #1e293b;
            border: 1px solid #cbd5e1;
            padding: 0.4rem 0.85rem;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.825rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            transition: all 0.2s ease;
          }
          .docs-nav-btn:hover {
            background: #e2e8f0;
            border-color: #94a3b8;
          }
          .badge-status {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.4rem 0.8rem;
            background: #f0fdf4;
            color: #166534;
            font-size: 0.825rem;
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
            gap: 0.65rem;
            font-size: 0.875rem;
            color: #334155;
            padding-left: 0.75rem;
            border-left: 1px solid #e2e8f0;
          }
          .user-email {
            font-weight: 600;
            color: #1e293b;
          }
          .user-role {
            font-size: 0.725rem;
            font-weight: 700;
            text-transform: uppercase;
            padding: 0.15rem 0.45rem;
            border-radius: 4px;
          }
          .role-admin {
            background: #e0e7ff;
            color: #4338ca;
          }
          .role-reviewer {
            background: #fef3c7;
            color: #b45309;
          }
          .logout-btn {
            background: #fee2e2;
            color: #dc2626;
            border: 1px solid #fca5a5;
            padding: 0.35rem 0.75rem;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .logout-btn:hover {
            background: #fca5a5;
            color: #991b1b;
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
