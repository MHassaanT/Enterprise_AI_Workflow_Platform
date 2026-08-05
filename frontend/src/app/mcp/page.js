'use client';

import { useState, useEffect } from 'react';
import Header from '../components/Header';
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
      <div className="hub-page">
        <Header />

        <main className="hub-main">
          {/* Header Banner */}
          <div className="page-header">
            <div>
              <span className="badge">⚡ Integration Hub</span>
              <h1>Centralized API & OAuth2 Integration Hub</h1>
              <p>
                Connect services (GitHub, Vercel, SafePay, Supabase) with zero-trust AES-256-GCM credential encryption.
              </p>
            </div>
          </div>

          {message.text && (
            <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
              {message.text}
            </div>
          )}

          {/* Section 1: Integration Grid */}
          <section className="section-container">
            <div className="section-title-bar">
              <div>
                <h2>🔌 API Key & OAuth2 Integrations</h2>
                <p className="sub-txt">Select an integration card to connect via OAuth2 popup or secure input modal.</p>
              </div>
            </div>

            {loading ? (
              <p className="loading-txt">Loading Integration Hub...</p>
            ) : (
              <div className="integration-grid">
                {integrations.map((item) => (
                  <div key={item.canonical_name} className="integration-card">
                    <div className="card-top-bar" style={{ background: item.gradient }}>
                      <span className="card-icon">{item.icon}</span>
                      <span className="card-category">{item.category}</span>
                    </div>

                    <div className="card-body">
                      <div className="card-title-row">
                        <h3>{item.display_name}</h3>
                        <span className={`status-pill ${item.isConnected ? 'status-connected' : 'status-disconnected'}`}>
                          {item.isConnected ? '● Connected' : '○ Not Connected'}
                        </span>
                      </div>
                      <p className="card-desc">{item.description}</p>
                    </div>

                    <div className="card-footer">
                      {isAdmin ? (
                        <button
                          onClick={() => handleConnectClick(item)}
                          className="btn-connect"
                        >
                          {item.isConnected
                            ? item.auth_mode === 'oauth2' ? '🔄 Re-authorize OAuth2' : '⚙️ Reconfigure Credentials'
                            : item.auth_mode === 'oauth2' ? '🔗 Authorize via OAuth2' : '🔌 Connect Integration'}
                        </button>
                      ) : (
                        <span className="read-only-txt">Admin Access Required to Connect</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Per-Agent Tool Allowlist */}
          <section className="section-container card-panel">
            <div className="card-header">
              <h2>🤖 Per-Agent Tool Access & Policy Controls</h2>
              <span className="card-sub">Configure dynamic tool allowlists and human-in-the-loop approvals per agent instance.</span>
            </div>

            {agents.length === 0 ? (
              <p className="loading-txt">No active agent instances found.</p>
            ) : (
              <div className="agent-selector">
                <label>Select Agent Instance:</label>
                <select value={selectedAgentId} onChange={handleSelectAgent}>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <hr className="divider" />

            {/* Add Tool to Allowlist */}
            {isAdmin && (
              <div className="add-tool-box">
                <h4>Bind Integration Tool to Agent</h4>
                <div className="form-row">
                  <div className="form-group flex-2">
                    <input
                      type="text"
                      placeholder="Tool Name (e.g. get_issues, list_deployments, SafePay)"
                      value={newToolName}
                      onChange={(e) => setNewToolName(e.target.value)}
                    />
                  </div>
                  <div className="form-group flex-1">
                    <select
                      value={newToolConnector}
                      onChange={(e) => setNewToolConnector(e.target.value)}
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
                </div>

                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Description for LLM tool selection..."
                    value={newToolDescription}
                    onChange={(e) => setNewToolDescription(e.target.value)}
                  />
                </div>

                <div className="checkbox-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={newToolIsHighRisk}
                      onChange={(e) => setNewToolIsHighRisk(e.target.checked)}
                    />
                    <span>Require Human Approval (High-Risk Action)</span>
                  </label>

                  <button onClick={handleAddToolBinding} className="btn btn-secondary-sm">
                    + Add Tool
                  </button>
                </div>
              </div>
            )}

            {/* Current Tool Bindings List */}
            <h3 className="section-subtitle">Bound Tools Allowlist ({agentBindings.length})</h3>
            <div className="bindings-list">
              {agentBindings.length === 0 ? (
                <div className="empty-box">No tools bound to this agent instance.</div>
              ) : (
                agentBindings.map((binding) => (
                  <div key={binding.tool_name} className="binding-item">
                    <div className="binding-main">
                      <div className="binding-title">
                        <code>{binding.tool_name}</code>
                        <span className={`type-tag type-${binding.connector_type}`}>
                          {binding.connector_type}
                        </span>
                      </div>
                      {binding.config?.description && (
                        <p className="binding-desc">{binding.config.description}</p>
                      )}
                    </div>

                    <div className="binding-controls">
                      <button
                        onClick={() => handleToggleHighRisk(binding.tool_name)}
                        className={`risk-btn ${binding.is_high_risk ? 'risk-high' : 'risk-low'}`}
                        title="Toggle Human Approval Requirement"
                        disabled={!isAdmin}
                      >
                        {binding.is_high_risk ? '🛡️ Approval Required' : '⚡ Auto Execute'}
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => handleRemoveToolBinding(binding.tool_name)}
                          className="btn-danger-sm"
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

            {isAdmin && (
              <div className="save-bar">
                <button
                  onClick={handleSaveAgentConfig}
                  className="btn btn-save"
                  disabled={submitting || !selectedAgentId}
                >
                  {submitting ? 'Saving Configuration...' : '💾 Save Agent Runtime Config'}
                </button>
              </div>
            )}
          </section>
        </main>

        {/* ── SAFEPAY SECURE INPUT MODAL ── */}
        {activeModal === 'SafePay' && (
          <div className="modal-backdrop" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header safepay-header">
                <div className="modal-title">
                  <span className="modal-icon">💳</span>
                  <div>
                    <h2>Connect SafePay Payment Gateway</h2>
                    <span className="modal-sub">API-Key Credentials Encryption</span>
                  </div>
                </div>
                <button onClick={closeModal} className="modal-close">×</button>
              </div>

              <form onSubmit={handleSafePaySubmit} className="modal-form">
                <div className="form-group">
                  <label>SafePay Secret Key</label>
                  <input
                    type="password"
                    placeholder="sec_live_sk_xxxxxxxxxxxxxxxx"
                    value={safePaySecret}
                    onChange={(e) => setSafePaySecret(e.target.value)}
                    required
                    autoFocus
                  />
                  <small className="field-hint">Key is encrypted with AES-256-GCM before database insertion.</small>
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={closeModal} className="btn-cancel">
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit safepay-btn" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── SUPABASE SECURE INPUT MODAL ── */}
        {activeModal === 'Supabase' && (
          <div className="modal-backdrop" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header supabase-header">
                <div className="modal-title">
                  <span className="modal-icon">⚡</span>
                  <div>
                    <h2>Connect Supabase Database Hub</h2>
                    <span className="modal-sub">PostgREST & Service Role Credentials</span>
                  </div>
                </div>
                <button onClick={closeModal} className="modal-close">×</button>
              </div>

              <form onSubmit={handleSupabaseSubmit} className="modal-form">
                <div className="form-group">
                  <label>Project URL</label>
                  <input
                    type="url"
                    placeholder="https://xyzcompany.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Service Role Key</label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    required
                  />
                  <small className="field-hint">Payload encrypted using AES-256-GCM and scoped to active tenant.</small>
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={closeModal} className="btn-cancel">
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit supabase-btn" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── STRIPE SECURE INPUT MODAL ── */}
        {activeModal === 'Stripe' && (
          <div className="modal-backdrop" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header stripe-header">
                <div className="modal-title">
                  <span className="modal-icon">💳</span>
                  <div>
                    <h2>Connect Stripe B2B Billing & Payments</h2>
                    <span className="modal-sub">Restricted API Key Credentials</span>
                  </div>
                </div>
                <button onClick={closeModal} className="modal-close">×</button>
              </div>

              <form onSubmit={handleStripeSubmit} className="modal-form">
                <div className="form-group">
                  <label>Restricted API Key</label>
                  <input
                    type="password"
                    placeholder="rk_live_... / rk_test_..."
                    value={stripeApiKey}
                    onChange={(e) => setStripeApiKey(e.target.value)}
                    required
                    autoFocus
                  />
                  <small className="field-hint">Payload encrypted using AES-256-GCM and scoped to active tenant. High-risk operations (refunds) require HITL approval.</small>
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={closeModal} className="btn-cancel">
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit stripe-btn" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <style jsx>{`
          .hub-page {
            min-height: 100vh;
            background: #f8fafc;
          }
          .hub-main {
            max-width: 1400px;
            margin: 2rem auto;
            padding: 0 1.5rem;
          }
          .page-header {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #ffffff;
            border-radius: 16px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25);
          }
          .badge {
            background: rgba(255, 255, 255, 0.1);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.3);
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 700;
          }
          .page-header h1 {
            margin: 0.5rem 0 0.25rem 0;
            font-size: 1.8rem;
            font-weight: 800;
          }
          .page-header p {
            color: #94a3b8;
            margin: 0;
            font-size: 0.95rem;
          }
          .alert {
            padding: 1rem 1.25rem;
            border-radius: 10px;
            margin-bottom: 1.5rem;
            font-weight: 600;
            font-size: 0.9rem;
          }
          .alert-error {
            background: #fef2f2;
            color: #991b1b;
            border: 1px solid #fca5a5;
          }
          .alert-success {
            background: #f0fdf4;
            color: #166534;
            border: 1px solid #bbf7d0;
          }
          .section-container {
            margin-bottom: 2.5rem;
          }
          .section-title-bar h2 {
            font-size: 1.35rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
          }
          .sub-txt {
            color: #64748b;
            font-size: 0.9rem;
            margin: 0.25rem 0 1.25rem 0;
          }
          .integration-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
            gap: 1.5rem;
          }
          .integration-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
            display: flex;
            flex-direction: column;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .integration-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.06);
          }
          .card-top-bar {
            padding: 1rem 1.25rem;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .card-icon {
            font-size: 1.5rem;
          }
          .card-category {
            font-size: 0.75rem;
            font-weight: 700;
            background: rgba(255,255,255,0.2);
            padding: 0.2rem 0.5rem;
            border-radius: 6px;
            text-transform: uppercase;
          }
          .card-body {
            padding: 1.25rem;
            flex: 1;
          }
          .card-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.5rem;
          }
          .card-title-row h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 800;
            color: #0f172a;
          }
          .status-pill {
            font-size: 0.75rem;
            font-weight: 700;
            padding: 0.2rem 0.6rem;
            border-radius: 20px;
          }
          .status-connected {
            background: #dcfce7;
            color: #15803d;
          }
          .status-disconnected {
            background: #f1f5f9;
            color: #64748b;
          }
          .card-desc {
            font-size: 0.85rem;
            color: #64748b;
            line-height: 1.45;
            margin: 0;
          }
          .card-footer {
            padding: 1rem 1.25rem;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
          }
          .btn-connect {
            width: 100%;
            border: none;
            background: #0f172a;
            color: #ffffff;
            padding: 0.65rem;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.85rem;
            cursor: pointer;
            transition: background 0.2s;
          }
          .btn-connect:hover {
            background: #1e293b;
          }
          .read-only-txt {
            font-size: 0.8rem;
            color: #94a3b8;
            font-weight: 600;
          }
          .card-panel {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 1.75rem;
          }
          .card-header h2 {
            margin: 0;
            font-size: 1.25rem;
            color: #0f172a;
            font-weight: 800;
          }
          .card-sub {
            font-size: 0.85rem;
            color: #64748b;
            display: block;
            margin-top: 0.2rem;
          }
          .divider {
            border: 0;
            border-top: 1px solid #e2e8f0;
            margin: 1.5rem 0;
          }
          .agent-selector {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
          }
          .agent-selector label {
            font-size: 0.85rem;
            font-weight: 700;
            color: #334155;
          }
          .agent-selector select {
            padding: 0.65rem;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-weight: 600;
          }
          .add-tool-box {
            background: #f1f5f9;
            border: 1px dashed #cbd5e1;
            border-radius: 10px;
            padding: 1rem;
            margin-bottom: 1.25rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }
          .add-tool-box h4 {
            margin: 0;
            font-size: 0.9rem;
            color: #1e293b;
          }
          .form-row {
            display: flex;
            gap: 0.75rem;
          }
          .flex-1 { flex: 1; }
          .flex-2 { flex: 2; }
          .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
          }
          .form-group label {
            font-size: 0.8rem;
            font-weight: 700;
            color: #334155;
          }
          .form-group input, .form-group select {
            padding: 0.6rem 0.85rem;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-size: 0.875rem;
            outline: none;
          }
          .checkbox-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 0.8rem;
            color: #475569;
            font-weight: 600;
          }
          .checkbox-row label {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            cursor: pointer;
          }
          .btn-secondary-sm {
            background: #4f46e5;
            color: #ffffff;
            border: none;
            padding: 0.45rem 0.85rem;
            border-radius: 6px;
            font-weight: 700;
            font-size: 0.8rem;
            cursor: pointer;
          }
          .section-subtitle {
            font-size: 0.95rem;
            font-weight: 700;
            color: #334155;
            margin: 0 0 0.5rem 0;
          }
          .bindings-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }
          .binding-item {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 0.85rem 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .binding-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .binding-title code {
            background: #0f172a;
            color: #38bdf8;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.85rem;
          }
          .type-tag {
            font-size: 0.7rem;
            font-weight: 700;
            padding: 0.15rem 0.45rem;
            border-radius: 4px;
            text-transform: uppercase;
          }
          .type-github { background: #f1f5f9; color: #0f172a; }
          .type-vercel { background: #e2e8f0; color: #000000; }
          .type-safepay { background: #e0e7ff; color: #4338ca; }
          .type-supabase { background: #dcfce7; color: #15803d; }
          .type-builtin { background: #f1f5f9; color: #475569; }
          .binding-desc {
            margin: 0.25rem 0 0 0;
            font-size: 0.8rem;
            color: #64748b;
          }
          .binding-controls {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .risk-btn {
            border: none;
            padding: 0.35rem 0.65rem;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 700;
            cursor: pointer;
          }
          .risk-high {
            background: #fee2e2;
            color: #b91c1c;
            border: 1px solid #fca5a5;
          }
          .risk-low {
            background: #f0fdf4;
            color: #15803d;
            border: 1px solid #bbf7d0;
          }
          .btn-danger-sm {
            background: #fee2e2;
            color: #dc2626;
            border: 1px solid #fca5a5;
            padding: 0.35rem 0.6rem;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 700;
          }
          .empty-box {
            padding: 1.5rem;
            text-align: center;
            background: #f8fafc;
            border-radius: 8px;
            color: #94a3b8;
            font-size: 0.85rem;
          }
          .save-bar {
            margin-top: 1.5rem;
          }
          .btn-save {
            background: #16a34a;
            color: #ffffff;
            width: 100%;
            padding: 0.8rem;
            font-size: 0.95rem;
            border: none;
            border-radius: 8px;
            font-weight: 700;
            cursor: pointer;
          }
          .btn-save:hover {
            background: #15803d;
          }
          .loading-txt {
            color: #64748b;
            font-size: 0.85rem;
          }

          /* ── MODAL STYLES ── */
          .modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 1rem;
          }
          .modal-content {
            background: #ffffff;
            border-radius: 16px;
            width: 100%;
            max-width: 520px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.25);
            overflow: hidden;
            animation: modalSlide 0.25s ease-out;
          }
          @keyframes modalSlide {
            from { transform: translateY(15px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .modal-header {
            padding: 1.5rem;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .safepay-header {
            background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
          }
          .supabase-header {
            background: linear-gradient(135deg, #059669 0%, #047857 100%);
          }
          .vercel-header {
            background: linear-gradient(135deg, #000000 0%, #1e293b 100%);
          }
          .modal-title {
            display: flex;
            align-items: center;
            gap: 0.75rem;
          }
          .modal-icon {
            font-size: 1.8rem;
          }
          .modal-title h2 {
            margin: 0;
            font-size: 1.15rem;
            font-weight: 800;
          }
          .modal-sub {
            font-size: 0.75rem;
            opacity: 0.9;
            font-weight: 600;
          }
          .modal-close {
            background: rgba(255,255,255,0.2);
            border: none;
            color: #ffffff;
            font-size: 1.5rem;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .modal-form {
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
          }
          .field-hint {
            color: #64748b;
            font-size: 0.75rem;
            margin-top: 0.2rem;
          }
          .modal-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 0.75rem;
            margin-top: 0.5rem;
          }
          .btn-cancel {
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #475569;
            padding: 0.6rem 1.25rem;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.85rem;
            cursor: pointer;
          }
          .btn-submit {
            border: none;
            color: #ffffff;
            padding: 0.6rem 1.25rem;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.85rem;
            cursor: pointer;
          }
          .safepay-btn { background: #4f46e5; }
          .supabase-btn { background: #059669; }
          .vercel-btn { background: #000000; }
        `}</style>
      </div>
    </AuthGuard>
  );
}
