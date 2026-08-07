'use client';

import { useState, useEffect } from 'react';
import Header from '../../components/Header';
import AuthGuard from '../../components/AuthGuard';
import {
  fetchToolRegistry,
  fetchGatewayBindings,
  saveGatewayBinding,
  deleteGatewayBinding,
  saveToolCredentials,
  fetchAgents,
  getUser,
} from '@/lib/api';

export default function AdminToolsPage() {
  const [user, setUser] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [bindings, setBindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Selected binding for credential editing
  const [activeCredentialBinding, setActiveCredentialBinding] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [authType, setAuthType] = useState('api_key');

  // New binding form state
  const [selectedCanonicalName, setSelectedCanonicalName] = useState('');
  const [customRiskOverride, setCustomRiskOverride] = useState(false);

  useEffect(() => {
    setUser(getUser());
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [regData, agentList] = await Promise.all([
        fetchToolRegistry().catch(() => []),
        fetchAgents().catch(() => []),
      ]);
      setRegistry(regData);
      setAgents(agentList);

      if (agentList.length > 0) {
        const firstId = agentList[0].id;
        setSelectedAgentId(firstId);
        loadBindings(firstId);
      }
    } catch (err) {
      console.error('Error loading admin tools data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBindings = async (agentId) => {
    try {
      const bList = await fetchGatewayBindings(agentId);
      setBindings(bList);
    } catch (err) {
      console.error('Error loading bindings:', err);
    }
  };

  const handleAgentChange = (e) => {
    const id = e.target.value;
    setSelectedAgentId(id);
    loadBindings(id);
  };

  const handleBindTool = async (e) => {
    e.preventDefault();
    if (!selectedAgentId || !selectedCanonicalName) {
      setMessage({ type: 'error', text: 'Select an agent and a tool to bind.' });
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: '', text: '' });

      const regItem = registry.find((r) => r.canonical_name === selectedCanonicalName);

      await saveGatewayBinding({
        agent_instance_id: selectedAgentId,
        tool_id: regItem?.id,
        tool_name: selectedCanonicalName,
        connector_type: regItem?.provider_type || 'builtin',
        is_enabled: true,
        custom_risk_override: customRiskOverride,
      });

      setMessage({ type: 'success', text: `Tool '${selectedCanonicalName}' bound successfully!` });
      setSelectedCanonicalName('');
      loadBindings(selectedAgentId);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBinding = async (bindingId) => {
    if (!confirm('Are you sure you want to remove this tool binding?')) return;
    try {
      await deleteGatewayBinding(bindingId);
      setMessage({ type: 'success', text: 'Tool binding removed.' });
      loadBindings(selectedAgentId);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    if (!activeCredentialBinding || !apiKeyInput) return;

    try {
      setSaving(true);
      setMessage({ type: '', text: '' });

      const payload = { api_key: apiKeyInput };
      await saveToolCredentials(activeCredentialBinding.id, authType, payload);

      setMessage({
        type: 'success',
        text: `Credentials for '${activeCredentialBinding.tool_name}' encrypted & saved securely via AES-256-GCM!`,
      });
      setActiveCredentialBinding(null);
      setApiKeyInput('');
      loadBindings(selectedAgentId);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthGuard>
      <div className="admin-tools-page">
        <Header />

        <main className="main-content">
          {/* Header Banner */}
          <div className="banner">
            <div>
              <span className="badge">🔒 Centralized MCP Gateway</span>
              <h1>Tool Registry & Tenant Credentials Manager</h1>
              <p>
                Configure vendor adapters (Airtable, Resend, HubSpot), manage dynamic agent tool allowlists, and securely store API keys with AES-256-GCM encryption & RLS isolation.
              </p>
            </div>
          </div>

          {message.text && (
            <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
              {message.text}
            </div>
          )}

          <div className="layout-grid">
            {/* Left Column: Tool Registry & Agent Binding Form */}
            <div className="card">
              <h2>🧰 Global Tool Registry ({registry.length})</h2>
              <span className="card-sub">Pre-configured tools and vendor adapters available across platform</span>

              <div className="registry-list">
                {registry.map((tool) => (
                  <div key={tool.canonical_name} className="registry-item">
                    <div className="reg-info">
                      <strong>{tool.display_name || tool.canonical_name}</strong>
                      <code>{tool.canonical_name}</code>
                    </div>
                    <div className="reg-tags">
                      <span className={`tag provider-${tool.provider_type}`}>{tool.provider_type}</span>
                      {tool.is_high_risk && <span className="tag risk-tag">🛡️ High Risk</span>}
                    </div>
                  </div>
                ))}
              </div>

              {isAdmin && (
                <>
                  <hr className="divider" />
                  <h3>🔗 Bind Tool to Selected Agent</h3>
                  <form onSubmit={handleBindTool} className="bind-form">
                    <div className="form-group">
                      <label>Target Agent Instance</label>
                      <select value={selectedAgentId} onChange={handleAgentChange}>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.id.slice(0, 8)}...)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Select Tool from Registry</label>
                      <select
                        value={selectedCanonicalName}
                        onChange={(e) => setSelectedCanonicalName(e.target.value)}
                        required
                      >
                        <option value="">-- Select Tool --</option>
                        {registry.map((t) => (
                          <option key={t.canonical_name} value={t.canonical_name}>
                            {t.display_name} ({t.provider_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="checkbox-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={customRiskOverride}
                          onChange={(e) => setCustomRiskOverride(e.target.checked)}
                        />
                        <span>Force High Risk (Require Human Approval Checkpoint)</span>
                      </label>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? 'Binding...' : '+ Bind Tool to Agent'}
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Right Column: Agent Bindings & Credentials Input */}
            <div className="card">
              <h2>🤖 Bound Tools & Secure Credentials</h2>
              <span className="card-sub">Active allowlist for selected agent instance</span>

              <div className="agent-selector-row">
                <label>Active Agent:</label>
                <select value={selectedAgentId} onChange={handleAgentChange}>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bindings-container">
                {loading ? (
                  <p className="loading-txt">Loading bindings...</p>
                ) : bindings.length === 0 ? (
                  <div className="empty-box">No tool bindings for this agent instance yet.</div>
                ) : (
                  bindings.map((b) => (
                    <div key={b.id} className="binding-card">
                      <div className="binding-header">
                        <div>
                          <strong>{b.display_name || b.tool_name}</strong>
                          <code>{b.tool_name}</code>
                        </div>
                        <span className={`tag provider-${b.provider_type || b.connector_type}`}>
                          {b.provider_type || b.connector_type}
                        </span>
                      </div>

                      <div className="binding-status-row">
                        <span className="status-item">
                          Risk Level: {b.custom_risk_override || b.registry_high_risk ? '🛡️ High Risk (Approval Req)' : '⚡ Auto Execute'}
                        </span>
                        <span className="status-item">
                          Credentials: {b.credential_id ? '🔑 Encrypted (AES-256)' : '⚠️ Missing API Key'}
                        </span>
                      </div>

                      {isAdmin && (
                        <div className="binding-actions">
                          <button
                            onClick={() => setActiveCredentialBinding(b)}
                            className="btn btn-secondary-sm"
                          >
                            🔑 {b.credential_id ? 'Update API Key' : 'Configure API Key'}
                          </button>
                          <button
                            onClick={() => handleDeleteBinding(b.id)}
                            className="btn-danger-sm"
                          >
                            ✖ Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Secure Credentials Modal / In-line Form */}
              {activeCredentialBinding && (
                <div className="cred-modal">
                  <div className="modal-content">
                    <h3>🔐 Enter API Credentials for '{activeCredentialBinding.tool_name}'</h3>
                    <p className="modal-sub">
                      Payload will be encrypted with AES-256-GCM before DB insertion and protected by Postgres Row-Level Security.
                    </p>

                    <form onSubmit={handleSaveCredentials} className="modal-form">
                      <div className="form-group">
                        <label>Authentication Type</label>
                        <select value={authType} onChange={(e) => setAuthType(e.target.value)}>
                          <option value="api_key">API Key / Bearer Token</option>
                          <option value="oauth_token">OAuth Access Token</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Secret API Key / Token</label>
                        <input
                          type="password"
                          placeholder="e.g. resend_key_..., pat_airtable_..., hubspot_access_..."
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          required
                        />
                      </div>

                      <div className="modal-buttons">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                          {saving ? 'Encrypting & Saving...' : '🔒 Save Encrypted Credentials'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveCredentialBinding(null)}
                          className="btn btn-cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        <style jsx>{`
          .admin-tools-page {
            min-height: 100vh;
            background: var(--color-bg);
          }
          .main-content {
            max-width: 1200px;
            margin: 2rem auto;
            padding: 0 1.5rem;
            animation: fadeIn 0.4s ease-out;
          }
          .banner {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            color: var(--color-text);
            border-radius: var(--radius-lg);
            padding: 2rem 2.5rem;
            margin-bottom: 2.5rem;
            box-shadow: var(--shadow-sm);
          }
          .badge {
            background: var(--color-secondary);
            color: var(--color-muted);
            border: 1px solid var(--color-border);
            padding: 0.25rem 0.75rem;
            border-radius: var(--radius-sm);
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.02em;
          }
          .banner h1 {
            margin: 0.75rem 0 0.25rem 0;
            font-size: 1.75rem;
            font-weight: 700;
            color: var(--color-text);
            letter-spacing: -0.02em;
          }
          .banner p {
            color: var(--color-muted);
            margin: 0;
            font-size: 0.95rem;
          }
          .alert {
            padding: 1rem 1.25rem;
            border-radius: var(--radius);
            margin-bottom: 1.5rem;
            font-weight: 500;
            font-size: 0.9rem;
          }
          .alert-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
          .alert-success { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
          .layout-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.5rem;
          }
          @media (max-width: 1024px) {
            .layout-grid { grid-template-columns: 1fr; }
          }
          .card {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: 2rem 2.5rem;
            box-shadow: var(--shadow-card);
            display: flex;
            flex-direction: column;
          }
          .card h2 { margin: 0; font-size: 1.25rem; color: var(--color-text); font-weight: 700; }
          .card-sub { font-size: 0.9rem; color: var(--color-muted); margin-top: 0.25rem; display: block; }
          .divider { border: 0; border-top: 1px solid var(--color-border); margin: 2rem 0; }
          .registry-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem; }
          .registry-item {
            background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1rem 1.25rem;
            display: flex; align-items: center; justify-content: space-between;
          }
          .reg-info { display: flex; flex-direction: column; gap: 0.4rem; }
          .reg-info strong { font-weight: 600; color: var(--color-text); }
          .reg-info code { font-size: 0.85rem; color: var(--color-text); background: var(--color-bg); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); }
          .reg-tags { display: flex; gap: 0.5rem; }
          .tag { padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; border: 1px solid transparent; }
          .provider-airtable { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
          .provider-resend { background: #fefce8; color: #a16207; border-color: #fef08a; }
          .provider-hubspot { background: #fff7ed; color: #c2410c; border-color: #ffedd5; }
          .provider-builtin { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
          .risk-tag { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }
          .bind-form { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1.5rem; }
          .form-group { display: flex; flex-direction: column; gap: 0.4rem; }
          .form-group label { font-size: 0.85rem; font-weight: 500; color: var(--color-text); }
          .form-group input, .form-group select {
            padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius); font-size: 0.9rem; outline: none; background: var(--color-surface); color: var(--color-text);
          }
          .form-group input:focus, .form-group select:focus {
            border-color: var(--color-accent); box-shadow: 0 0 0 1px var(--color-accent);
          }
          .checkbox-row { font-size: 0.85rem; font-weight: 500; color: var(--color-text); }
          .checkbox-row label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
          .agent-selector-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 1.5rem; }
          .agent-selector-row label { font-size: 0.85rem; font-weight: 600; color: var(--color-text); }
          .agent-selector-row select { padding: 0.65rem 1rem; border-radius: var(--radius); border: 1px solid var(--color-border); font-weight: 500; font-size: 0.9rem; background: var(--color-surface); color: var(--color-text); }
          .bindings-container { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; }
          .binding-card {
            background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1.25rem;
            display: flex; flex-direction: column; gap: 1rem;
          }
          .binding-header { display: flex; justify-content: space-between; align-items: center; }
          .binding-header strong { font-weight: 600; color: var(--color-text); }
          .binding-header code { font-size: 0.85rem; color: var(--color-text); background: var(--color-bg); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); margin-left: 0.5rem; }
          .binding-status-row { font-size: 0.85rem; color: var(--color-muted); display: flex; gap: 1rem; font-weight: 500; }
          .binding-actions { display: flex; gap: 0.75rem; align-items: center; }
          .btn { border: none; padding: 0.75rem 1.25rem; border-radius: var(--radius); font-weight: 600; font-size: 0.95rem; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm); }
          .btn-primary { background: var(--color-primary); color: #ffffff; }
          .btn-primary:hover { background: var(--color-primary-hover); box-shadow: var(--shadow-md); transform: translateY(-1px); }
          .btn-secondary-sm { background: var(--color-surface); color: var(--color-text); padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid var(--color-border); cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm); }
          .btn-secondary-sm:hover { background: var(--color-secondary); border-color: #d1d5db; }
          .btn-danger-sm { background: var(--color-surface); color: #dc2626; border: 1px solid var(--color-border); padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; }
          .btn-danger-sm:hover { background: #fef2f2; border-color: #fca5a5; }
          .btn-cancel { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); }
          .btn-cancel:hover { background: var(--color-secondary); }
          .empty-box { padding: 2rem; text-align: center; color: var(--color-muted); font-size: 0.9rem; background: var(--color-bg); border-radius: var(--radius-lg); border: 1px dashed var(--color-border); }
          .cred-modal {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(17, 24, 39, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000;
          }
          .modal-content {
            background: var(--color-surface); border-radius: var(--radius-lg); padding: 2.5rem; max-width: 500px; width: 90%;
            box-shadow: var(--shadow-modal); border: 1px solid var(--color-border); animation: modalSlide 0.2s ease-out;
          }
          @keyframes modalSlide {
            from { transform: translateY(10px) scale(0.98); opacity: 0; }
            to { transform: translateY(0) scale(1); opacity: 1; }
          }
          .modal-content h3 { margin: 0; font-size: 1.15rem; color: var(--color-text); font-weight: 700; }
          .modal-sub { font-size: 0.85rem; color: var(--color-muted); margin: 0.5rem 0 1.5rem 0; line-height: 1.5; }
          .modal-form { display: flex; flex-direction: column; gap: 1.25rem; }
          .modal-buttons { display: flex; gap: 0.75rem; margin-top: 1rem; }
        `}</style>
      </div>
    </AuthGuard>
  );
}
