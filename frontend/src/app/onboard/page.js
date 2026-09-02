'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/api';
import { getAccessibleAgents } from '@/lib/planGating';
import DocumentModal from '../components/DocumentModal';

// Master data for all agents and their onboarding configuration steps
const AGENT_ONBOARDING_DATA = [
  {
    id: 'chat',
    route: '/chat',
    name: 'Chat Support Agent',
    icon: 'forum',
    badge: 'Customer Support',
    description: 'Handles customer inquiries, checks order status, and provides 24/7 automated customer support.',
    steps: [
      {
        id: 'chat-kb',
        title: 'Knowledge Base',
        description: 'Upload your documents so that the agent knows how to answer or you can add link to your website.',
        actionType: 'kb_modal',
        linkText: 'Open Knowledge Base',
      },
      {
        id: 'chat-gmail',
        title: 'Gmail Connection',
        description: 'Connect Gmail MCP Connection to let the agent send emails to the customer.',
        actionType: 'link',
        link: '/mcp',
        linkText: 'MCP Tools Page',
      },
      {
        id: 'chat-airtable',
        title: 'Airtable Integration',
        description: 'Connect Airtable database to give agent info about your orders.',
        actionType: 'link',
        link: '/mcp',
        linkText: 'MCP Tools Page',
      },
      {
        id: 'chat-gateway',
        title: 'Tools Gateway Configuration',
        description: 'Configure the gmail and check_order_status in tools gateway.',
        actionType: 'link',
        link: '/admin/tools',
        linkText: 'Tools Gateway Page',
      },
      {
        id: 'chat-widget',
        title: 'Widget Setup',
        description: 'Embed the chat widget on your website to allow customers to chat directly with the support agent.',
        actionType: 'link',
        link: '/widget-setup',
        linkText: 'Widget Setup Page',
      },
    ],
    note: 'Note: Gmail, Airtable and tools configuration is not required if your business does not sell products.',
  },
  {
    id: 'hr',
    route: '/hr',
    name: 'HR Agent',
    icon: 'groups',
    badge: 'Human Resources',
    description: 'Manages employee records, handles policy inquiries, and automates internal HR communications.',
    steps: [
      {
        id: 'hr-kb',
        title: 'Knowledge Base',
        description: 'Upload your documents so that the agent knows how to answer or you can add link to your website.',
        actionType: 'kb_modal',
        linkText: 'Open Knowledge Base',
      },
      {
        id: 'hr-gmail',
        title: 'Gmail Connection',
        description: 'Connect Gmail MCP Connection to let the agent send emails to employees/candidates.',
        actionType: 'link',
        link: '/mcp',
        linkText: 'MCP Tools Page',
      },
    ],
  },
  {
    id: 'pm',
    route: '/pm',
    name: 'PM Agent',
    icon: 'account_tree',
    badge: 'Project Management',
    description: 'Coordinates project tasks, tracks milestones, and automates status reporting.',
    steps: [
      {
        id: 'pm-kb',
        title: 'Knowledge Base',
        description: 'Upload your documents so that the agent knows how to answer or you can add link to your website.',
        actionType: 'kb_modal',
        linkText: 'Open Knowledge Base',
      },
      {
        id: 'pm-gmail',
        title: 'Gmail Connection',
        description: 'Connect Gmail MCP Connection to let the agent send emails to the team.',
        actionType: 'link',
        link: '/mcp',
        linkText: 'MCP Tools Page',
      },
    ],
  },
  {
    id: 'sales',
    route: '/sales',
    name: 'Sales Agent',
    icon: 'trending_up',
    badge: 'Sales & Growth',
    description: 'Engages prospects, qualifies leads, and manages deal workflows.',
    steps: [
      {
        id: 'sales-kb',
        title: 'Knowledge Base',
        description: 'Upload your documents so that the agent knows how to answer or you can add link to your website.',
        actionType: 'kb_modal',
        linkText: 'Open Knowledge Base',
      },
      {
        id: 'sales-gmail',
        title: 'Gmail Connection',
        description: 'Connect Gmail MCP Connection to let the agent send emails to prospects.',
        actionType: 'link',
        link: '/mcp',
        linkText: 'MCP Tools Page',
      },
    ],
  },
  {
    id: 'procurement',
    route: '/procurement',
    name: 'Procurement Agent',
    icon: 'shopping_cart',
    badge: 'Supply Chain',
    description: 'Handles vendor purchase orders, inventory checks, and approval requests.',
    steps: [
      {
        id: 'procurement-kb',
        title: 'Knowledge Base',
        description: 'Upload your documents so that the agent knows how to answer or you can add link to your website.',
        actionType: 'kb_modal',
        linkText: 'Open Knowledge Base',
      },
      {
        id: 'procurement-gmail',
        title: 'Gmail Connection',
        description: 'Connect Gmail MCP Connection to let the agent send emails to vendors.',
        actionType: 'link',
        link: '/mcp',
        linkText: 'MCP Tools Page',
      },
    ],
  },
  {
    id: 'finance',
    route: '/finance',
    name: 'Finance Agent',
    icon: 'account_balance',
    badge: 'Finance & Billing',
    description: 'Tracks subscription metrics, processes payments, and generates financial summaries.',
    steps: [],
    noConfigText: 'No Configurations needed',
  },
  {
    id: 'analytics',
    route: '/analytics',
    name: 'Analytics Agent',
    icon: 'analytics',
    badge: 'Data & Metrics',
    description: 'Analyzes operational data, agent execution metrics, and provides real-time performance insights.',
    steps: [],
    noConfigText: 'No Configurations needed',
  },
  {
    id: 'workflows',
    route: '/admin/workflows',
    name: 'Workflow Builder Agent',
    icon: 'hub',
    badge: 'Orchestration',
    description: 'Custom graph orchestrator to connect tools into automated multi-step workflows.',
    steps: [
      {
        id: 'workflows-mcp',
        title: 'MCP Tools & Workflows',
        description: 'You can connect as many MCP Tools as you want in the mcp page and then make workflows by them.',
        actionType: 'multi_link',
        links: [
          { href: '/mcp', text: 'MCP Tools Page' },
          { href: '/admin/workflows', text: 'Workflow Builder' },
        ],
      },
    ],
  },
  {
    id: 'coding',
    route: '/coding',
    name: 'Coding Agent',
    icon: 'code',
    badge: 'Engineering',
    description: 'Analyzes codebases, generates pull requests, and automates code reviews.',
    steps: [
      {
        id: 'coding-github',
        title: 'GitHub Integration',
        description: 'Connect github mcp to let agent access your repositories and open pull requests.',
        actionType: 'link',
        link: '/mcp',
        linkText: 'Connect GitHub MCP',
      },
    ],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userPlan, setUserPlan] = useState('pro');
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [filterMode, setFilterMode] = useState('plan'); // 'plan' | 'all'
  const [completedSteps, setCompletedSteps] = useState({});

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (currentUser?.subscriptionPlan) {
      setUserPlan(currentUser.subscriptionPlan);
    }

    const storageKey = currentUser?.tenantId
      ? `onboarding_completed_steps_${currentUser.tenantId}`
      : (currentUser?.id ? `onboarding_completed_steps_${currentUser.id}` : 'onboarding_completed_steps');

    // Fetch progress from PostgreSQL backend API, fallback to localStorage
    const loadProgress = async () => {
      try {
        const { getOnboardingProgress } = await import('@/lib/api');
        const dbSteps = await getOnboardingProgress();
        if (dbSteps && Object.keys(dbSteps).length > 0) {
          setCompletedSteps(dbSteps);
          localStorage.setItem(storageKey, JSON.stringify(dbSteps));
          return;
        }
      } catch (err) {
        console.warn('Backend onboarding progress sync warning, reading localStorage fallback:', err.message);
      }

      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setCompletedSteps(JSON.parse(saved));
        } else {
          setCompletedSteps({});
        }
      } catch (e) {
        console.error('Failed to load onboarding steps:', e);
      }
    };

    loadProgress();
  }, []);

  const toggleStep = async (stepId) => {
    const nextCompleted = !completedSteps[stepId];

    // Optimistic UI update
    setCompletedSteps((prev) => ({
      ...prev,
      [stepId]: nextCompleted,
    }));

    const storageKey = user?.tenantId
      ? `onboarding_completed_steps_${user.tenantId}`
      : (user?.id ? `onboarding_completed_steps_${user.id}` : 'onboarding_completed_steps');

    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      saved[stepId] = nextCompleted;
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch (e) {
      console.error('Failed to save onboarding step state to localStorage:', e);
    }

    // Persist to backend PostgreSQL
    try {
      const { toggleOnboardingStep } = await import('@/lib/api');
      await toggleOnboardingStep(stepId, nextCompleted);
    } catch (err) {
      console.warn('Backend toggleOnboardingStep error:', err.message);
    }
  };

  // Determine accessible routes for current plan
  const accessibleRoutes = getAccessibleAgents(userPlan);

  // Filter agents based on plan or display all
  const visibleAgents = AGENT_ONBOARDING_DATA.filter((agent) => {
    if (filterMode === 'all') return true;
    if (!userPlan || userPlan === 'none') return true;
    return accessibleRoutes.some((route) => agent.route.startsWith(route));
  });

  // Calculate overall setup progress
  const totalConfigurableSteps = visibleAgents.reduce((acc, agent) => acc + agent.steps.length, 0);
  const totalCompletedSteps = visibleAgents.reduce((acc, agent) => {
    return acc + agent.steps.filter((s) => completedSteps[s.id]).length;
  }, 0);

  const progressPercentage = totalConfigurableSteps > 0 
    ? Math.round((totalCompletedSteps / totalConfigurableSteps) * 100) 
    : 100;

  return (
    <div className="min-h-screen bg-background text-on-surface p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-primary/10 blur-[150px] rounded-full pointer-events-none"></div>

      <div className="max-w-6xl mx-auto space-y-8 relative z-10">
        {/* Header & Hero Section */}
        <div className="bg-surface-container-low border border-outline-variant rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary-container/20 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                  <span className="material-symbols-outlined text-2xl">rocket_launch</span>
                </div>
                <div>
                  <h1 className="font-display-lg text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
                    Agent Setup & Onboarding Guide
                  </h1>
                  <p className="font-body-md text-xs sm:text-sm text-on-surface-variant">
                    Follow these step-by-step configurations to activate and run your AI workforce.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Plan Badge */}
              <div className="px-4 py-2 rounded-xl bg-primary-container/15 border border-primary/30 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-label-md text-xs text-primary font-bold uppercase tracking-wider">
                  {userPlan} Plan Active
                </span>
              </div>

              {/* Dashboard Link CTA */}
              <Link
                href="/dashboard"
                className="px-5 py-2.5 bg-primary text-on-primary font-label-md text-xs font-bold rounded-xl hover:bg-primary-container transition-all shadow-md shadow-primary/20 flex items-center gap-2"
              >
                <span>Go to Workspace</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Progress Bar & Filter Toggle */}
          <div className="mt-8 pt-6 border-t border-outline-variant/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 space-y-2 max-w-xl">
              <div className="flex items-center justify-between font-label-md text-xs">
                <span className="text-on-surface-variant font-semibold">Overall Setup Progress</span>
                <span className="text-primary font-bold">{progressPercentage}% Completed ({totalCompletedSteps}/{totalConfigurableSteps} Steps)</span>
              </div>
              <div className="h-2.5 w-full bg-surface-container rounded-full overflow-hidden border border-outline-variant">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center bg-surface-container rounded-xl p-1 border border-outline-variant self-start md:self-auto">
              <button
                onClick={() => setFilterMode('plan')}
                className={`px-3 py-1.5 rounded-lg text-xs font-label-md font-semibold transition-colors ${
                  filterMode === 'plan'
                    ? 'bg-primary-container text-on-primary-container shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Subscribed Agents ({visibleAgents.length})
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-label-md font-semibold transition-colors ${
                  filterMode === 'all'
                    ? 'bg-primary-container text-on-primary-container shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All 9 Agents
              </button>
            </div>
          </div>
        </div>

        {/* Plan Filter Notice */}
        {filterMode === 'plan' && (
          <div className="px-4 py-3 bg-surface-container-low border border-outline-variant/80 rounded-2xl flex items-center justify-between text-xs text-on-surface-variant">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">info</span>
              <span>
                Showing setup for agents included in your <b>{userPlan.toUpperCase()}</b> plan ({visibleAgents.length} agents).
              </span>
            </div>
            {userPlan !== 'enterprise' && (
              <Link href="/billing" className="text-primary font-bold hover:underline">
                Upgrade Plan for More Agents ↗
              </Link>
            )}
          </div>
        )}

        {/* AGENTS LISTING GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleAgents.map((agent) => {
            const agentConfigurableSteps = agent.steps.length;
            const agentCompletedSteps = agent.steps.filter((s) => completedSteps[s.id]).length;
            const isAgentFullyConfigured = agentConfigurableSteps === 0 || agentCompletedSteps === agentConfigurableSteps;

            return (
              <div
                key={agent.id}
                className={`bg-surface-container-low border rounded-2xl p-6 shadow-xl flex flex-col justify-between transition-all duration-200 relative overflow-hidden ${
                  isAgentFullyConfigured
                    ? 'border-emerald-500/40 bg-emerald-950/10'
                    : 'border-outline-variant hover:border-primary/50'
                }`}
              >
                {/* Agent Header */}
                <div>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-primary-container/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                        <span className="material-symbols-outlined text-2xl">{agent.icon}</span>
                      </div>
                      <div>
                        <h2 className="font-display-lg text-lg font-bold text-on-surface tracking-tight">
                          {agent.name}
                        </h2>
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-surface-container text-on-surface-variant border border-outline-variant">
                          {agent.badge}
                        </span>
                      </div>
                    </div>

                    {isAgentFullyConfigured ? (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 font-label-md text-[11px] font-bold flex items-center gap-1 shrink-0">
                        <span className="material-symbols-outlined text-sm text-emerald-400">check_circle</span>
                        Ready
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-300 font-label-md text-[11px] font-bold flex items-center gap-1 shrink-0">
                        <span className="material-symbols-outlined text-sm text-amber-400">pending</span>
                        {agentCompletedSteps}/{agentConfigurableSteps} Done
                      </span>
                    )}
                  </div>

                  {/* Single-line Brief Description */}
                  <p className="font-body-md text-xs text-on-surface-variant leading-relaxed mb-5">
                    {agent.description}
                  </p>

                  {/* Requirements / Steps Section */}
                  <div className="space-y-3 border-t border-outline-variant/60 pt-4">
                    <h3 className="font-label-md text-[11px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center justify-between">
                      <span>Configurations & Tools</span>
                      {agentConfigurableSteps > 0 && (
                        <span className="text-primary">{agentCompletedSteps}/{agentConfigurableSteps} Completed</span>
                      )}
                    </h3>

                    {/* Check if no configurations needed */}
                    {agent.steps.length === 0 && (
                      <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-400 text-lg">verified</span>
                        <span>{agent.noConfigText || 'No Configurations needed'}</span>
                      </div>
                    )}

                    {/* Step Cards List */}
                    {agent.steps.map((step, idx) => {
                      const isChecked = !!completedSteps[step.id];

                      return (
                        <div
                          key={step.id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isChecked
                              ? 'bg-surface-container/60 border-emerald-500/30 opacity-80'
                              : 'bg-surface-container border-outline-variant hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleStep(step.id)}
                              className="mt-0.5 h-4 w-4 rounded border-outline-variant bg-surface text-primary focus:ring-primary cursor-pointer shrink-0"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`font-body-md text-xs font-bold ${isChecked ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                                  {idx + 1}. {step.title}
                                </span>

                                {/* Action Buttons */}
                                {step.actionType === 'kb_modal' && (
                                  <button
                                    onClick={() => setIsDocModalOpen(true)}
                                    className="px-2.5 py-1 bg-primary-container/20 text-primary border border-primary/30 rounded-lg text-[11px] font-label-md font-bold hover:bg-primary-container/40 transition-colors flex items-center gap-1 shrink-0"
                                  >
                                    <span className="material-symbols-outlined text-xs">folder_open</span>
                                    <span>{step.linkText}</span>
                                  </button>
                                )}

                                {step.actionType === 'link' && (
                                  <Link
                                    href={step.link}
                                    className="px-2.5 py-1 bg-primary-container/20 text-primary border border-primary/30 rounded-lg text-[11px] font-label-md font-bold hover:bg-primary-container/40 transition-colors flex items-center gap-1 shrink-0"
                                  >
                                    <span>{step.linkText}</span>
                                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                                  </Link>
                                )}

                                {step.actionType === 'multi_link' && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {step.links.map((l, lIdx) => (
                                      <Link
                                        key={lIdx}
                                        href={l.href}
                                        className="px-2 py-0.5 bg-primary-container/20 text-primary border border-primary/30 rounded-lg text-[10px] font-label-md font-bold hover:bg-primary-container/40 transition-colors"
                                      >
                                        {l.text} ↗
                                      </Link>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <p className={`font-body-md text-xs leading-relaxed ${isChecked ? 'text-on-surface-variant/70' : 'text-on-surface-variant'}`}>
                                {step.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Agent Special Notes */}
                    {agent.note && (
                      <div className="mt-3 p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
                        <span className="material-symbols-outlined text-amber-400 text-sm shrink-0 mt-0.5">info</span>
                        <span>{agent.note}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Launch Button */}
                <div className="pt-5 mt-5 border-t border-outline-variant/60 flex items-center justify-between">
                  <span className="text-[11px] font-body-md text-on-surface-variant">
                    Route: <code className="text-primary font-mono">{agent.route}</code>
                  </span>
                  <Link
                    href={agent.route}
                    className="px-4 py-2 bg-surface-container border border-outline-variant text-on-surface font-label-md text-xs font-bold rounded-xl hover:bg-primary-container/20 hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-1.5"
                  >
                    <span>Launch Agent</span>
                    <span className="material-symbols-outlined text-xs">launch</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Completion Action Banner */}
        {progressPercentage === 100 && (
          <div className="bg-gradient-to-r from-emerald-950/60 to-surface-container-low border border-emerald-500/50 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <span className="material-symbols-outlined text-2xl">task_alt</span>
            </div>
            <div>
              <h2 className="font-display-lg text-xl font-bold text-white">All Set! Your AI Agents Are Ready</h2>
              <p className="font-body-md text-xs text-emerald-200/80 mt-1 max-w-md mx-auto">
                You have completed all initial configurations. Navigate to your workspace dashboard to start interacting with your agents.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-label-md text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20"
            >
              <span>Go to Dashboard</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
        )}
      </div>

      {/* Embedded Knowledge Base Document Modal */}
      <DocumentModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
      />
    </div>
  );
}
