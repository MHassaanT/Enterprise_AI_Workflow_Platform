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
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <Header />

        <main className="max-w-container-max mx-auto px-lg py-xl">
          {/* Header Banner */}
          <header className="mb-xl border-b border-outline-variant pb-lg">
            <span className="font-label-md text-label-md text-primary bg-primary-container/10 px-3 py-1 rounded-full border border-primary/20 inline-block mb-3">
              🔒 Centralized MCP Gateway
            </span>
            <h1 className="font-display-lg text-display-lg text-on-surface mb-2">
              Tool Registry & Tenant Credentials Manager
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
              Configure vendor adapters (Airtable, Resend, HubSpot), manage dynamic agent tool allowlists, and securely store API keys with AES-256-GCM encryption & RLS isolation.
            </p>
          </header>

          {message.text && (
            <div className={`p-md rounded-lg mb-lg font-body-md ${message.type === 'error' ? 'bg-error-container/20 text-error border border-error/30' : 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/40'}`}>
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
            {/* Left Column: Tool Registry & Agent Binding Form */}
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm flex flex-col">
              <h2 className="font-headline-md text-headline-md text-on-surface">🧰 Global Tool Registry ({registry.length})</h2>
              <span className="font-body-md text-body-md text-on-surface-variant mt-1 mb-lg">Pre-configured tools and vendor adapters available across platform</span>

              <div className="space-y-3 mb-xl">
                {registry.map((tool) => (
                  <div key={tool.canonical_name} className="bg-surface border border-outline-variant rounded-lg p-md flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <strong className="font-body-md text-on-surface font-semibold">{tool.display_name || tool.canonical_name}</strong>
                      <code className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant w-fit">{tool.canonical_name}</code>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-label-md text-label-md px-2 py-0.5 rounded uppercase font-mono bg-surface-container-high border border-outline-variant text-on-surface-variant">
                        {tool.provider_type}
                      </span>
                      {tool.is_high_risk && (
                        <span className="font-label-md text-label-md px-2 py-0.5 rounded uppercase font-mono bg-tertiary-container/20 text-tertiary border border-tertiary/30">
                          🛡️ High Risk
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {isAdmin && (
                <>
                  <hr className="border-outline-variant mb-xl" />
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-md">🔗 Bind Tool to Selected Agent</h3>
                  <form onSubmit={handleBindTool} className="space-y-md">
                    <div className="flex flex-col gap-2">
                      <label className="font-label-md text-label-md text-on-surface-variant">Target Agent Instance</label>
                      <select value={selectedAgentId} onChange={handleAgentChange} className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary">
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.id.slice(0, 8)}...)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="font-label-md text-label-md text-on-surface-variant">Select Tool from Registry</label>
                      <select
                        value={selectedCanonicalName}
                        onChange={(e) => setSelectedCanonicalName(e.target.value)}
                        required
                        className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                      >
                        <option value="">-- Select Tool --</option>
                        {registry.map((t) => (
                          <option key={t.canonical_name} value={t.canonical_name}>
                            {t.display_name} ({t.provider_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer font-body-md text-on-surface">
                        <input
                          type="checkbox"
                          checked={customRiskOverride}
                          onChange={(e) => setCustomRiskOverride(e.target.checked)}
                          className="rounded border-outline-variant bg-surface text-primary focus:ring-primary"
                        />
                        <span>Force High Risk (Require Human Approval Checkpoint)</span>
                      </label>
                    </div>

                    <button type="submit" className="w-full py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50 mt-4" disabled={saving}>
                      {saving ? 'Binding...' : '+ Bind Tool to Agent'}
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Right Column: Agent Bindings & Credentials Input */}
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm flex flex-col">
              <h2 className="font-headline-md text-headline-md text-on-surface">🤖 Bound Tools & Secure Credentials</h2>
              <span className="font-body-md text-body-md text-on-surface-variant mt-1 mb-md">Active allowlist for selected agent instance</span>

              <div className="flex items-center gap-md mb-lg p-md bg-surface border border-outline-variant rounded-lg">
                <label className="font-label-md text-label-md text-on-surface-variant whitespace-nowrap">Active Agent:</label>
                <select value={selectedAgentId} onChange={handleAgentChange} className="w-full p-2 bg-surface-container border border-outline-variant rounded-md text-on-surface focus:outline-none">
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                {loading ? (
                  <p className="text-on-surface-variant text-center py-lg">Loading bindings...</p>
                ) : bindings.length === 0 ? (
                  <div className="p-xl text-center text-on-surface-variant bg-surface border border-dashed border-outline-variant rounded-lg">No tool bindings for this agent instance yet.</div>
                ) : (
                  bindings.map((b) => (
                    <div key={b.id} className="bg-surface border border-outline-variant rounded-lg p-md space-y-md">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <strong className="font-body-md text-on-surface font-semibold">{b.display_name || b.tool_name}</strong>
                          <code className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant">{b.tool_name}</code>
                        </div>
                        <span className="font-label-md text-label-md px-2 py-0.5 rounded uppercase font-mono bg-surface-container-high border border-outline-variant text-on-surface-variant">
                          {b.provider_type || b.connector_type}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-md font-label-md text-label-md text-on-surface-variant">
                        <span>
                          Risk Level: {b.custom_risk_override || b.registry_high_risk ? '🛡️ High Risk (Approval Req)' : '⚡ Auto Execute'}
                        </span>
                        <span>
                          Credentials: {b.credential_id ? '🔑 Encrypted (AES-256)' : '⚠️ Missing API Key'}
                        </span>
                      </div>

                      {isAdmin && (
                        <div className="flex gap-md pt-2">
                          <button
                            onClick={() => setActiveCredentialBinding(b)}
                            className="px-md py-1.5 bg-surface-container border border-outline-variant rounded-md font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors"
                          >
                            🔑 {b.credential_id ? 'Update API Key' : 'Configure API Key'}
                          </button>
                          <button
                            onClick={() => handleDeleteBinding(b.id)}
                            className="px-md py-1.5 bg-error-container/20 border border-error/30 text-error rounded-md font-label-md text-label-md hover:bg-error-container/40 transition-colors"
                          >
                            ✖ Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Secure Credentials Modal */}
              {activeCredentialBinding && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50">
                  <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl max-w-lg w-full shadow-2xl space-y-md">
                    <h3 className="font-headline-md text-headline-md text-on-surface">🔐 Enter API Credentials for '{activeCredentialBinding.tool_name}'</h3>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Payload will be encrypted with AES-256-GCM before DB insertion and protected by Postgres Row-Level Security.
                    </p>

                    <form onSubmit={handleSaveCredentials} className="space-y-md">
                      <div className="flex flex-col gap-2">
                        <label className="font-label-md text-label-md text-on-surface-variant">Authentication Type</label>
                        <select value={authType} onChange={(e) => setAuthType(e.target.value)} className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none">
                          <option value="api_key">API Key / Bearer Token</option>
                          <option value="oauth_token">OAuth Access Token</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="font-label-md text-label-md text-on-surface-variant">Secret API Key / Token</label>
                        <input
                          type="password"
                          placeholder="e.g. resend_key_..., pat_airtable_..., hubspot_access_..."
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          required
                          className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="flex gap-md pt-md">
                        <button type="submit" className="flex-1 py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50" disabled={saving}>
                          {saving ? 'Encrypting & Saving...' : '🔒 Save Encrypted Credentials'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveCredentialBinding(null)}
                          className="px-lg py-md bg-surface border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container transition-colors"
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
      </div>
    </AuthGuard>
  );
}
