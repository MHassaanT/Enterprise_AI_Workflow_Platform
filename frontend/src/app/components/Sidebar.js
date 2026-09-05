'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getUser, logout } from '@/lib/api';
import { canAccessRoute, AGENT_ROUTES, getAccessibleAgents } from '@/lib/planGating';
import DocumentModal from './DocumentModal';

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    pathname === '/subscribe' ||
    pathname === '/verify-email' ||
    pathname.startsWith('/attendance')
  ) {
    return null;
  }

  const isAdmin = user?.role === 'admin';
  const plan = user?.subscriptionPlan || 'none';
  const accessibleAgents = getAccessibleAgents(plan);

  // Full nav items list — agents are filtered by plan
  const allNavItems = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', isAgent: false },
    { label: 'Onboarding Setup', href: '/onboard', icon: 'rocket_launch', isAgent: false },
    { label: 'Customer Support Agent', href: '/chat', icon: 'forum', isAgent: true },
    { label: 'Sales Agent', href: '/sales', icon: 'trending_up', isAgent: true },
    { label: 'Procurement Agent', href: '/procurement', icon: 'shopping_cart', isAgent: true },
    { label: 'HR Agent', href: '/hr', icon: 'groups', isAgent: true },
    { label: 'Finance Agent', href: '/finance', icon: 'account_balance', isAgent: true },
    { label: 'Analytics Agent', href: '/analytics', icon: 'analytics', isAgent: true },
    { label: 'Coding Agent', href: '/coding', icon: 'code', isAgent: true },
    { label: 'PM Agent', href: '/pm', icon: 'account_tree', isAgent: true },
    { label: 'Approvals and Appointments', href: '/approvals', icon: 'event_available', isAgent: false },
    { label: 'Workflows', href: '/admin/workflows', icon: 'account_tree', isAgent: true },
    { label: 'Widget Setup', href: '/widget-setup', icon: 'extension', isAgent: false },
    { label: 'MCP Tools', href: '/mcp', icon: 'hub', isAgent: false },
    { label: 'Entity Schema', href: '/entities', icon: 'database', isAgent: false },
    { label: 'Admin Gateway', href: '/admin/tools', icon: 'settings_applications', isAgent: false },
    ...(isAdmin ? [{ label: 'Team Users', href: '/users', icon: 'group', isAgent: false }] : []),
    { label: 'Billing', href: '/billing', icon: 'payments', isAgent: false },
  ];

  // Filter nav items based on plan — non-agent items always shown, agent items filtered by plan access
  const navItems = allNavItems.filter((item) => {
    if (!item.isAgent) return true;
    return accessibleAgents.some(route => item.href.startsWith(route));
  });

  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  // Plan badge display
  const planBadge = plan !== 'none' ? plan.charAt(0).toUpperCase() + plan.slice(1) : null;

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-surface/90 backdrop-blur-md border-b border-outline-variant z-40 px-lg flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
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
        className={`fixed md:sticky left-0 top-0 h-screen max-h-screen bg-surface border-r border-outline-variant flex flex-col justify-between p-md z-50 transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        <div className="flex flex-col min-h-0 flex-1 space-y-3">
          {/* Logo & Header */}
          <div className={`shrink-0 px-sm pt-xs flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <Link href="/dashboard" className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} group`} onClick={() => setIsOpenMobile(false)}>
              <div className="h-10 w-10 rounded-xl bg-primary-container/20 flex items-center justify-center shrink-0 border border-primary/30 group-hover:border-primary/60 transition-colors">
                <span className="material-symbols-outlined text-primary text-xl">hexagon</span>
              </div>
              {!isCollapsed && (
                <div>
                  <h1 className="font-headline-md text-headline-md font-extrabold text-on-surface leading-tight">Enterprise AI</h1>
                  <p className="font-label-md text-label-md text-on-surface-variant">Control Platform</p>
                </div>
              )}
            </Link>
            {!isCollapsed && (
              <button onClick={() => setIsCollapsed(true)} className="hidden md:block p-1 rounded hover:bg-surface-container text-on-surface-variant">
                <span className="material-symbols-outlined text-sm">keyboard_double_arrow_left</span>
              </button>
            )}
          </div>
          {isCollapsed && (
             <div className="shrink-0 hidden md:flex justify-center mt-2">
               <button onClick={() => setIsCollapsed(false)} className="p-1 rounded hover:bg-surface-container text-on-surface-variant">
                 <span className="material-symbols-outlined text-sm">keyboard_double_arrow_right</span>
               </button>
             </div>
          )}

          {/* Plan Badge */}
          {planBadge && !isCollapsed && (
            <div className="shrink-0 mx-sm px-3 py-1.5 rounded-lg bg-primary-container/10 border border-primary/20 text-center">
              <span className="font-label-md text-label-md text-primary font-bold">{planBadge} Plan</span>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="space-y-1 flex-1 min-h-0 overflow-y-auto pr-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpenMobile(false)}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg font-body-md text-body-md transition-colors ${
                    active
                      ? 'text-primary bg-primary-container/10 border-r-2 border-primary font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}

            <button
              onClick={() => {
                setIsDocModalOpen(true);
                setIsOpenMobile(false);
              }}
              title={isCollapsed ? "Knowledge Base" : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg font-body-md text-body-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-left`}
            >
              <span className="material-symbols-outlined text-xl">folder</span>
              {!isCollapsed && <span>Knowledge Base</span>}
            </button>
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="shrink-0 space-y-md border-t border-outline-variant pt-md px-xs mt-2">
          {/* Agent Status Badge */}
          <div className={`flex items-center ${isCollapsed ? 'justify-center py-2' : 'justify-between px-3 py-2'} rounded-lg bg-emerald-950/40 border border-emerald-800/50`} title={isCollapsed ? "Agent Active" : undefined}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              {!isCollapsed && <span className="font-label-md text-label-md text-emerald-400 font-semibold">Agent Active</span>}
            </div>
          </div>

          {/* User Info & Logout */}
          {user && (
            <div className={`bg-surface-container-low border border-outline-variant rounded-xl ${isCollapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-sm space-y-2'}`}>
              {!isCollapsed && (
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
              )}
              <button
                onClick={logout}
                title={isCollapsed ? "Log Out" : undefined}
                className={`w-full flex items-center justify-center ${isCollapsed ? 'p-1.5' : 'gap-2 py-1.5 px-md'} bg-error-container/20 text-error border border-error/30 rounded-lg font-label-md text-label-md font-semibold hover:bg-error-container/40 transition-colors`}
              >
                <span className="material-symbols-outlined text-base">logout</span>
                {!isCollapsed && <span>Log Out</span>}
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
