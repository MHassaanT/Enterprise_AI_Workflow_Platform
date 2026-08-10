'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getUser, logout } from '@/lib/api';
import DocumentModal from './DocumentModal';

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  if (pathname === '/login') {
    return null;
  }

  const isAdmin = user?.role === 'admin';

  const navItems = [
    { label: 'Dashboard', href: '/', icon: 'dashboard' },
    { label: 'Support Chat', href: '/chat', icon: 'forum' },
    { label: 'Widget Setup', href: '/widget-setup', icon: 'extension' },
    { label: 'MCP Tools', href: '/mcp', icon: 'hub' },
    { label: 'Admin Gateway', href: '/admin/tools', icon: 'settings_applications' },
    { label: 'Human Approvals', href: '/admin/approvals', icon: 'fact_check' },
    { label: 'Workflows', href: '/admin/workflows', icon: 'account_tree' },
    ...(isAdmin ? [{ label: 'Team Users', href: '/users', icon: 'group' }] : []),
  ];

  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-surface/90 backdrop-blur-md border-b border-outline-variant z-40 px-lg flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-primary-container/20 flex items-center justify-center border border-primary/30 text-primary">
            <span className="material-symbols-outlined text-lg">hexagon</span>
          </div>
          <span className="font-headline-md text-headline-md font-extrabold text-on-surface">Enterprise AI</span>
        </Link>
        <button
          onClick={() => setIsOpenMobile(!isOpenMobile)}
          className="p-2 text-on-surface-variant hover:text-on-surface rounded-lg border border-outline-variant bg-surface-container"
        >
          <span className="material-symbols-outlined">{isOpenMobile ? 'close' : 'menu'}</span>
        </button>
      </div>

      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-surface border-r border-outline-variant flex flex-col justify-between p-md z-50 transition-transform duration-200 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="space-y-lg">
          {/* Logo & Header */}
          <div className="px-sm pt-xs flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group" onClick={() => setIsOpenMobile(false)}>
              <div className="h-10 w-10 rounded-xl bg-primary-container/20 flex items-center justify-center shrink-0 border border-primary/30 group-hover:border-primary/60 transition-colors">
                <span className="material-symbols-outlined text-primary text-xl">hexagon</span>
              </div>
              <div>
                <h1 className="font-headline-md text-headline-md font-extrabold text-on-surface leading-tight">Enterprise AI</h1>
                <p className="font-label-md text-label-md text-on-surface-variant">Control Platform</p>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpenMobile(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-body-md text-body-md transition-colors ${
                    active
                      ? 'text-primary bg-primary-container/10 border-r-2 border-primary font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <button
              onClick={() => {
                setIsDocModalOpen(true);
                setIsOpenMobile(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-body-md text-body-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-left"
            >
              <span className="material-symbols-outlined text-xl">folder</span>
              <span>Knowledge Base</span>
            </button>
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="space-y-md border-t border-outline-variant pt-md px-xs">
          {/* Agent Status Badge */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800/50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-label-md text-label-md text-emerald-400 font-semibold">Agent Active</span>
            </div>
          </div>

          {/* User Info & Logout */}
          {user && (
            <div className="p-sm bg-surface-container-low border border-outline-variant rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="truncate max-w-[130px]">
                  <p className="font-body-md text-body-md font-semibold text-on-surface truncate">{user.email}</p>
                </div>
                {user.role && (
                  <span className={`px-2 py-0.5 rounded font-mono-sm text-mono-sm uppercase font-bold ${isAdmin ? 'bg-primary-container/20 text-primary border border-primary/30' : 'bg-tertiary-container/20 text-tertiary border border-tertiary/30'}`}>
                    {user.role}
                  </span>
                )}
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-1.5 px-md bg-error-container/20 text-error border border-error/30 rounded-lg font-label-md text-label-md font-semibold hover:bg-error-container/40 transition-colors"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <DocumentModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
      />
    </>
  );
}
