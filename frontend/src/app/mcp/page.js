'use client';

import { useState, useEffect } from 'react';
import AuthGuard from '../components/AuthGuard';
import {
  fetchToolRegistry,
  connectIntegration,
  connectStripeCredentials,
  fetchAgents,
  fetchAgentConfig,
  updateAgentConfig,
  getUser,
  getToken,
} from '@/lib/api';

// Pre-seeded integration definitions for visual consistency
const SEEDED_INTEGRATIONS = [
  {
    id: 'safepay-card',
    canonical_name: 'SafePay',
    display_name: 'SafePay Payment Gateway',
    provider_type: 'safepay',
    auth_mode: 'api_key',
    description: 'Process payment verification, refunds, and checkout link generation with encrypted secret keys.',
    category: 'Payments & Billing',
    icon: '💳',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    fields: [
      { name: 'secret_key', label: 'Secret Key', type: 'password', placeholder: 'sec_live_sk_...' }
    ]
  },
  {
    id: 'supabase-card',
    canonical_name: 'Supabase',
    display_name: 'Supabase Database Hub',
    provider_type: 'supabase',
    auth_mode: 'api_key',
    description: 'Execute PostgREST queries, row-level mutations, and table lookups with service role authority.',
    category: 'Database & Backend',
    icon: '⚡',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    fields: [
      { name: 'project_url', label: 'Project URL', type: 'url', placeholder: 'https://xyzcompany.supabase.co' },
      { name: 'service_role_key', label: 'Service Role Key', type: 'password', placeholder: 'eyJhbGciOiJIUzI1NiIsInR5c...' }
    ]
  },
  {
    id: 'stripe-card',
    canonical_name: 'Stripe',
    display_name: 'Stripe B2B Billing & Payments',
    provider_type: 'stripe',
    auth_mode: 'api_key',
    description: 'Check subscription statuses, process customer refunds, and inspect charges with encrypted keys.',
    category: 'Payments & Billing',
    icon: '💳',
    gradient: 'linear-gradient(135deg, #635bff 0%, #32325d 100%)',
    fields: [
      { name: 'api_key', label: 'Restricted API Key', type: 'password', placeholder: 'rk_live_... / rk_test_...' }
    ]
  },
  {
    id: 'github-card',
    canonical_name: 'GitHub',
    display_name: 'GitHub Developer Platform',
    provider_type: 'github',
    auth_mode: 'oauth2',
    description: 'Manage repositories, track issues, inspect pull requests, and trigger workflow dispatches via OAuth2.',
    category: 'Developer Tools',
    icon: '🐙',
    gradient: 'linear-gradient(135deg, #24292e 0%, #040d21 100%)',
  },
  {
    id: 'vercel-card',
    canonical_name: 'Vercel',
    display_name: 'Vercel Cloud Platform',
    provider_type: 'vercel',
    auth_mode: 'oauth2',
    description: 'Inspect cloud deployments, check project build statuses, and manage environments via OAuth2.',
    category: 'Cloud & Infrastructure',
    icon: '▲',
    gradient: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
  },
  {
    id: 'airtable-card',
    canonical_name: 'Airtable',
    display_name: 'Airtable Relational DB',
    provider_type: 'airtable',
    auth_mode: 'oauth2',
    description: 'Query base records, create rows, and inspect schema structures via OAuth2.',
    category: 'Database & Backend',
    icon: '📊',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  },
  {
    id: 'hubspot-card',
    canonical_name: 'HubSpot',
    display_name: 'HubSpot CRM Platform',
    provider_type: 'hubspot',
    auth_mode: 'oauth2',
    description: 'Search contacts, create deals, and manage customer support tickets via OAuth2.',
    category: 'Sales & CRM',
    icon: '🧡',
    gradient: 'linear-gradient(135deg, #ff7a59 0%, #ff522b 100%)',
  },
  {
    id: 'clickup-card',
    canonical_name: 'ClickUp',
    display_name: 'ClickUp Project Workspace',
    provider_type: 'clickup',
    auth_mode: 'oauth2',
    description: 'Create tasks, query team workspace task lists, and update statuses via OAuth2.',
    category: 'Project Management',
    icon: '🎯',
    gradient: 'linear-gradient(135deg, #7b68ee 0%, #5f4bb6 100%)',
  }
];

export default function IntegrationHubPage() {
  const [user, setUser] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agentBindings, setAgentBindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Modal State
  const [activeModal, setActiveModal] = useState(null); // 'SafePay' | 'Supabase' | 'Stripe' | null
  const [modalTarget, setModalTarget] = useState(null);
  
  // SafePay Modal Fields
  const [safePaySecret, setSafePaySecret] = useState('');

  // Supabase Modal Fields
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  // Stripe Modal Fields
  const [stripeApiKey, setStripeApiKey] = useState('');

  // Form state for binding a tool to selected agent
  const [newToolName, setNewToolName] = useState('');
  const [newToolConnector, setNewToolConnector] = useState('builtin');
  const [newToolIsHighRisk, setNewToolIsHighRisk] = useState(false);
  const [newToolDescription, setNewToolDescription] = useState('');

  useEffect(() => {
    setUser(getUser());
    loadInitialData();

    // Listen for OAuth2 popup success messages
    const handleOAuthMessage = (event) => {
      if (event.data && event.data.type === 'OAUTH_SUCCESS') {
        setMessage({
          type: 'success',
          text: `🎉 ${event.data.provider.toUpperCase()} authorized & connected successfully via OAuth2!`
        });
        loadInitialData();
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [registryTools, agentList] = await Promise.all([
        fetchToolRegistry().catch(() => []),
        fetchAgents().catch(() => []),
      ]);

      // Merge backend registry tool statuses into seeded cards
      const merged = SEEDED_INTEGRATIONS.map((seed) => {
        const matched = registryTools.find(
          (t) => t.canonical_name.toLowerCase() === seed.canonical_name.toLowerCase()
        );
        return {
          ...seed,
          tool_id: matched?.id || seed.id,
          isConnected: Boolean(matched?.credential_id),
          updated_at: matched?.credential_updated_at,
        };
      });

      setIntegrations(merged);
      setAgents(agentList);

      if (agentList.length > 0 && !selectedAgentId) {
        setSelectedAgentId(agentList[0].id);
        loadAgentConfig(agentList[0].id);
      }
    } catch (err) {
      console.error('Error loading Integration Hub data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAgentConfig = async (agentId) => {
    try {
      const config = await fetchAgentConfig(agentId);
      setAgentBindings(config.tool_bindings || []);
    } catch (err) {
      console.error('Error loading agent config:', err);
    }
  };

  const handleSelectAgent = (e) => {
    const id = e.target.value;
    setSelectedAgentId(id);
    loadAgentConfig(id);
  };

  const handleConnectClick = (integration) => {
    if (integration.auth_mode === 'oauth2') {
      handleOAuthConnect(integration.canonical_name);
    } else {
      openConnectModal(integration);
    }
  };

  const handleOAuthConnect = (provider) => {
    const token = getToken() || localStorage.getItem('ai_platform_token');
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const popupUrl = `/api/integrations/connect/${provider.toLowerCase()}?token=${encodeURIComponent(token || '')}`;

    const popup = window.open(
      popupUrl,
      `Connect ${provider}`,
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
    );

    if (!popup) {
      alert('Popup blocked! Please allow popups for this site to complete OAuth connection.');
    }
  };

  const openConnectModal = (integration) => {
    setModalTarget(integration);
    setMessage({ type: '', text: '' });
    if (integration.canonical_name === 'SafePay') {
      setSafePaySecret('');
      setActiveModal('SafePay');
    } else if (integration.canonical_name === 'Supabase') {
      setSupabaseUrl('');
      setSupabaseKey('');
      setActiveModal('Supabase');
    } else if (integration.canonical_name === 'Stripe') {
      setStripeApiKey('');
      setActiveModal('Stripe');
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalTarget(null);
    setSafePaySecret('');
    setSupabaseUrl('');
    setSupabaseKey('');
    setStripeApiKey('');
  };

  const handleStripeSubmit = async (e) => {
    e.preventDefault();
    if (!stripeApiKey) {
      setMessage({ type: 'error', text: 'Stripe Restricted API Key is required.' });
      return;
    }

    try {
      setSubmitting(true);
      await connectStripeCredentials(stripeApiKey);
      setMessage({ type: 'success', text: '🔐 Stripe credentials encrypted and connected successfully!' });
      closeModal();
      await loadInitialData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Stripe credentials.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSafePaySubmit = async (e) => {
    e.preventDefault();
    if (!safePaySecret) {
      setMessage({ type: 'error', text: 'SafePay Secret Key is required.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = { secret_key: safePaySecret };
      await connectIntegration(modalTarget?.tool_id, 'SafePay', payload, 'api_key');

      setMessage({ type: 'success', text: '🔐 SafePay credentials encrypted and connected successfully!' });
      closeModal();
      await loadInitialData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect SafePay credentials.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupabaseSubmit = async (e) => {
    e.preventDefault();
    if (!supabaseUrl || !supabaseKey) {
      setMessage({ type: 'error', text: 'Both Project URL and Service Role Key are required.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        project_url: supabaseUrl,
        service_role_key: supabaseKey,
      };
      await connectIntegration(modalTarget?.tool_id, 'Supabase', payload, 'service_role');

      setMessage({ type: 'success', text: '🔐 Supabase credentials encrypted and connected successfully!' });
      closeModal();
      await loadInitialData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Supabase credentials.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToolBinding = () => {
    if (!newToolName) return;

    const existing = agentBindings.find((b) => b.tool_name === newToolName);
    if (existing) {
      alert(`Tool '${newToolName}' is already bound to this agent.`);
      return;
    }

    const newBinding = {
      tool_name: newToolName,
      connector_type: newToolConnector,
      is_high_risk: newToolIsHighRisk,
      config: { description: newToolDescription },
    };

    setAgentBindings([...agentBindings, newBinding]);
    setNewToolName('');
    setNewToolDescription('');
  };

  const handleRemoveToolBinding = (toolName) => {
    setAgentBindings(agentBindings.filter((b) => b.tool_name !== toolName));
  };

  const handleToggleHighRisk = (toolName) => {
    setAgentBindings(
      agentBindings.map((b) =>
        b.tool_name === toolName ? { ...b, is_high_risk: !b.is_high_risk } : b
      )
    );
  };

  const handleSaveAgentConfig = async () => {
    if (!selectedAgentId) return;

    try {
      setSubmitting(true);
      setMessage({ type: '', text: '' });
      const highRiskList = agentBindings.filter((b) => b.is_high_risk).map((b) => b.tool_name);
      await updateAgentConfig(selectedAgentId, agentBindings, highRiskList);
      setMessage({ type: 'success', text: 'Agent dynamic tool allowlist & runtime config saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <main className="max-w-container-max mx-auto px-lg py-xl">
          {/* Header Banner */}
          <header className="mb-xl border-b border-outline-variant pb-lg">
            <span className="font-label-md text-label-md text-primary bg-primary-container/10 px-3 py-1 rounded-full border border-primary/20 inline-block mb-3">
              ⚡ Integration Hub
            </span>
            <h1 className="font-display-lg text-display-lg text-on-surface mb-2">
              Centralized API & OAuth2 Integration Hub
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
              Connect services (GitHub, Vercel, SafePay, Supabase) with zero-trust AES-256-GCM credential encryption.
            </p>
          </header>

          {message.text && (
            <div className={`p-md rounded-lg mb-lg font-body-md ${message.type === 'error' ? 'bg-error-container/20 text-error border border-error/30' : 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/40'}`}>
              {message.text}
            </div>
          )}

          {/* Section 1: Integration Grid */}
          <section className="mb-xl">
            <div className="mb-md">
              <h2 className="font-headline-md text-headline-md text-on-surface">🔌 API Key & OAuth2 Integrations</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Select an integration card to connect via OAuth2 popup or secure input modal.</p>
            </div>

            {loading ? (
              <p className="text-on-surface-variant py-lg">Loading Integration Hub...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-lg">
                {integrations.map((item) => (
                  <div key={item.canonical_name} className="bg-surface-container-low border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col hover:border-outline transition-colors">
                    <div className="p-md text-white flex items-center justify-between" style={{ background: item.gradient }}>
                      <span className="text-2xl">{item.icon}</span>
                      <span className="font-label-md text-label-md bg-white/20 px-2 py-0.5 rounded uppercase font-mono tracking-wider">
                        {item.category}
                      </span>
                    </div>

                    <div className="p-md flex-1 flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">{item.display_name}</h3>
                        <span className={`font-label-md text-label-md px-2 py-0.5 rounded ${item.isConnected ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/50' : 'bg-surface-container text-on-surface-variant border border-outline-variant'}`}>
                          {item.isConnected ? '● Connected' : '○ Not Connected'}
                        </span>
                      </div>
                      <p className="font-body-md text-body-md text-on-surface-variant flex-1">{item.description}</p>
                    </div>

                    <div className="p-md bg-surface border-t border-outline-variant">
                      {isAdmin ? (
                        <button
                          onClick={() => handleConnectClick(item)}
                          className="w-full py-2 px-md bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-md hover:bg-primary-container transition-colors shadow-sm"
                        >
                          {item.isConnected
                            ? item.auth_mode === 'oauth2' ? '🔄 Re-authorize OAuth2' : '⚙️ Reconfigure Credentials'
                            : item.auth_mode === 'oauth2' ? '🔗 Authorize via OAuth2' : '🔌 Connect Integration'}
                        </button>
                      ) : (
                        <span className="font-label-md text-label-md text-on-surface-variant text-center block">Admin Access Required to Connect</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Per-Agent Tool Allowlist */}
          <section className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-lg">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">🤖 Per-Agent Tool Access & Policy Controls</h2>
              <span className="font-body-md text-body-md text-on-surface-variant">Configure dynamic tool allowlists and human-in-the-loop approvals per agent instance.</span>
            </div>

            {agents.length === 0 ? (
              <p className="text-on-surface-variant">No active agent instances found.</p>
            ) : (
              <div className="flex flex-col gap-2 max-w-md">
                <label className="font-label-md text-label-md text-on-surface-variant">Select Agent Instance:</label>
                <select value={selectedAgentId} onChange={handleSelectAgent} className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary">
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <hr className="border-outline-variant" />

            {/* Add Tool to Allowlist */}
            {isAdmin && (
              <div className="bg-surface border border-dashed border-outline-variant rounded-xl p-lg space-y-md">
                <h4 className="font-headline-md text-headline-md text-on-surface">Bind Integration Tool to Agent</h4>
                <div className="flex flex-col md:flex-row gap-md">
                  <input
                    type="text"
                    placeholder="Tool Name (e.g. get_issues, list_deployments, SafePay)"
                    value={newToolName}
                    onChange={(e) => setNewToolName(e.target.value)}
                    className="flex-2 p-3 bg-surface-container border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                  <select
                    value={newToolConnector}
                    onChange={(e) => setNewToolConnector(e.target.value)}
                    className="flex-1 p-3 bg-surface-container border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="builtin">Built-in</option>
                    <option value="airtable">Airtable</option>
                    <option value="github">GitHub</option>
                    <option value="vercel">Vercel</option>
                    <option value="safepay">SafePay</option>
                    <option value="supabase">Supabase</option>
                    <option value="stripe">Stripe</option>
                    <option value="hubspot">HubSpot</option>
                    <option value="clickup">ClickUp</option>
                    <option value="resend">Resend</option>
                  </select>
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Description for LLM tool selection..."
                    value={newToolDescription}
                    onChange={(e) => setNewToolDescription(e.target.value)}
                    className="w-full p-3 bg-surface-container border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer font-body-md text-on-surface">
                    <input
                      type="checkbox"
                      checked={newToolIsHighRisk}
                      onChange={(e) => setNewToolIsHighRisk(e.target.checked)}
                      className="rounded border-outline-variant bg-surface text-primary focus:ring-primary"
                    />
                    <span>Require Human Approval (High-Risk Action)</span>
                  </label>

                  <button onClick={handleAddToolBinding} className="px-md py-2 bg-surface-container border border-outline-variant text-on-surface font-label-md text-label-md rounded-md hover:bg-surface-container-high transition-colors">
                    + Add Tool
                  </button>
                </div>
              </div>
            )}

            {/* Current Tool Bindings List */}
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Bound Tools Allowlist ({agentBindings.length})</h3>
              <div className="space-y-3">
                {agentBindings.length === 0 ? (
                  <div className="p-xl text-center text-on-surface-variant bg-surface border border-dashed border-outline-variant rounded-lg">No tools bound to this agent instance.</div>
                ) : (
                  agentBindings.map((binding) => (
                    <div key={binding.tool_name} className="bg-surface border border-outline-variant rounded-lg p-md flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono-sm text-mono-sm text-on-surface bg-surface-container px-2 py-0.5 rounded border border-outline-variant">{binding.tool_name}</code>
                          <span className="font-label-md text-label-md px-2 py-0.5 rounded uppercase font-mono bg-surface-container-high border border-outline-variant text-on-surface-variant">
                            {binding.connector_type}
                          </span>
                        </div>
                        {binding.config?.description && (
                          <p className="font-body-md text-body-md text-on-surface-variant">{binding.config.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-md">
                        <button
                          onClick={() => handleToggleHighRisk(binding.tool_name)}
                          className={`px-3 py-1.5 rounded font-label-md text-label-md border transition-colors ${binding.is_high_risk ? 'bg-tertiary-container/20 text-tertiary border-tertiary/30' : 'bg-emerald-950/30 text-emerald-400 border-emerald-800/40'}`}
                          title="Toggle Human Approval Requirement"
                          disabled={!isAdmin}
                        >
                          {binding.is_high_risk ? '🛡️ Approval Required' : '⚡ Auto Execute'}
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => handleRemoveToolBinding(binding.tool_name)}
                            className="px-3 py-1.5 bg-error-container/20 text-error border border-error/30 rounded font-label-md text-label-md hover:bg-error-container/40 transition-colors"
                            title="Remove tool from allowlist"
                          >
                            ✖
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="pt-md border-t border-outline-variant">
                <button
                  onClick={handleSaveAgentConfig}
                  className="w-full py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50"
                  disabled={submitting || !selectedAgentId}
                >
                  {submitting ? 'Saving Configuration...' : '💾 Save Agent Runtime Config'}
                </button>
              </div>
            )}
          </section>
        </main>

        {/* SAFEPAY MODAL */}
        {activeModal === 'SafePay' && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50" onClick={closeModal}>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-lg bg-surface border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💳</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Connect SafePay Payment Gateway</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">API-Key Credentials Encryption</span>
                  </div>
                </div>
                <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface text-xl">×</button>
              </div>

              <form onSubmit={handleSafePaySubmit} className="p-xl space-y-md">
                <div className="flex flex-col gap-2">
                  <label className="font-label-md text-label-md text-on-surface-variant">SafePay Secret Key</label>
                  <input
                    type="password"
                    placeholder="sec_live_sk_xxxxxxxxxxxxxxxx"
                    value={safePaySecret}
                    onChange={(e) => setSafePaySecret(e.target.value)}
                    required
                    autoFocus
                    className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                  <small className="font-label-md text-label-md text-on-surface-variant">Key is encrypted with AES-256-GCM before database insertion.</small>
                </div>

                <div className="flex justify-end gap-md pt-md">
                  <button type="button" onClick={closeModal} className="px-lg py-md bg-surface border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SUPABASE MODAL */}
        {activeModal === 'Supabase' && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50" onClick={closeModal}>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-lg bg-surface border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Connect Supabase Database Hub</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">PostgREST & Service Role Credentials</span>
                  </div>
                </div>
                <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface text-xl">×</button>
              </div>

              <form onSubmit={handleSupabaseSubmit} className="p-xl space-y-md">
                <div className="flex flex-col gap-2">
                  <label className="font-label-md text-label-md text-on-surface-variant">Project URL</label>
                  <input
                    type="url"
                    placeholder="https://xyzcompany.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    required
                    autoFocus
                    className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-label-md text-label-md text-on-surface-variant">Service Role Key</label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    required
                    className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                  <small className="font-label-md text-label-md text-on-surface-variant">Payload encrypted using AES-256-GCM and scoped to active tenant.</small>
                </div>

                <div className="flex justify-end gap-md pt-md">
                  <button type="button" onClick={closeModal} className="px-lg py-md bg-surface border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* STRIPE MODAL */}
        {activeModal === 'Stripe' && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50" onClick={closeModal}>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-lg bg-surface border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💳</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Connect Stripe B2B Billing & Payments</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">Restricted API Key Credentials</span>
                  </div>
                </div>
                <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface text-xl">×</button>
              </div>

              <form onSubmit={handleStripeSubmit} className="p-xl space-y-md">
                <div className="flex flex-col gap-2">
                  <label className="font-label-md text-label-md text-on-surface-variant">Restricted API Key</label>
                  <input
                    type="password"
                    placeholder="rk_live_... / rk_test_..."
                    value={stripeApiKey}
                    onChange={(e) => setStripeApiKey(e.target.value)}
                    required
                    autoFocus
                    className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                  <small className="font-label-md text-label-md text-on-surface-variant">Payload encrypted using AES-256-GCM and scoped to active tenant. High-risk operations (refunds) require HITL approval.</small>
                </div>

                <div className="flex justify-end gap-md pt-md">
                  <button type="button" onClick={closeModal} className="px-lg py-md bg-surface border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
