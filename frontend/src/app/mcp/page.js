'use client';

import { useState, useEffect } from 'react';
import Header from '../components/Header';
import AuthGuard from '../components/AuthGuard';
import {
  fetchMCPServers,
  createMCPServer,
  deleteMCPServer,
  fetchAgents,
  fetchAgentConfig,
  updateAgentConfig,
  getUser,
} from '@/lib/api';

export default function MCPManagementPage() {
  const [user, setUser] = useState(null);
  const [mcpServers, setMcpServers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agentBindings, setAgentBindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form states for new MCP server
  const [name, setName] = useState('');
  const [transportType, setTransportType] = useState('http');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [authToken, setAuthToken] = useState('');

  // Form state for binding a tool to selected agent
  const [newToolName, setNewToolName] = useState('');
  const [newToolConnector, setNewToolConnector] = useState('builtin');
  const [newToolMcpServerId, setNewToolMcpServerId] = useState('');
  const [newToolIsHighRisk, setNewToolIsHighRisk] = useState(false);
  const [newToolDescription, setNewToolDescription] = useState('');

  useEffect(() => {
    setUser(getUser());
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [servers, agentList] = await Promise.all([
        fetchMCPServers().catch(() => []),
        fetchAgents().catch(() => []),
      ]);
      setMcpServers(servers);
      setAgents(agentList);

      if (agentList.length > 0) {
        setSelectedAgentId(agentList[0].id);
        loadAgentConfig(agentList[0].id);
      }
    } catch (err) {
      console.error('Error loading MCP data:', err);
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

  const handleAddMCPServer = async (e) => {
    e.preventDefault();
    if (!name || !endpointUrl) {
      setMessage({ type: 'error', text: 'Server Name and Endpoint URL are required.' });
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      await createMCPServer(name, transportType, endpointUrl, headers);
      setName('');
      setEndpointUrl('');
      setAuthToken('');
      setMessage({ type: 'success', text: 'MCP Server connection registered successfully!' });
      const updated = await fetchMCPServers();
      setMcpServers(updated);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMCPServer = async (id) => {
    if (!confirm('Are you sure you want to delete this MCP connection?')) return;
    try {
      await deleteMCPServer(id);
      setMcpServers(mcpServers.filter((s) => s.id !== id));
      setMessage({ type: 'success', text: 'MCP connection removed.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
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
      mcp_server_id: newToolConnector !== 'builtin' ? newToolMcpServerId : null,
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
      setSaving(true);
      setMessage({ type: '', text: '' });
      const highRiskList = agentBindings.filter((b) => b.is_high_risk).map((b) => b.tool_name);
      await updateAgentConfig(selectedAgentId, agentBindings, highRiskList);
      setMessage({ type: 'success', text: 'Agent dynamic tool allowlist & runtime config saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthGuard>
      <div className="mcp-page">
        <Header />

        <main className="mcp-main">
          {/* Header Banner */}
          <div className="page-header">
            <div>
              <span className="badge">🔌 Model Context Protocol (MCP)</span>
              <h1>Dynamic Tools & MCP Connection Hub</h1>
              <p>
                Connect unlimited external MCP servers (CRMs, SQL databases, APIs) and dynamically manage per-agent tool allowlists and human approval policies.
              </p>
            </div>
          </div>

          {message.text && (
            <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
              {message.text}
            </div>
          )}

          <div className="grid-container">
            {/* Left Column: Register & Manage MCP Connections */}
            <div className="card">
              <div className="card-header">
                <h2>🌐 Connect MCP Servers</h2>
                <span className="card-sub">Register external MCP endpoints to expose custom tools</span>
              </div>

              {isAdmin && (
                <form onSubmit={handleAddMCPServer} className="mcp-form">
                  <div className="form-group">
                    <label>Server Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Stripe Billing MCP, Sales CRM MCP"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group flex-1">
                      <label>Transport Protocol</label>
                      <select value={transportType} onChange={(e) => setTransportType(e.target.value)}>
                        <option value="http">HTTP JSON-RPC</option>
                        <option value="sse">Server-Sent Events (SSE)</option>
                        <option value="stdio">Subprocess (Stdio)</option>
                      </select>
                    </div>

                    <div className="form-group flex-2">
                      <label>Endpoint URL / Path</label>
                      <input
                        type="url"
                        placeholder="https://mcp.internal.company.com/rpc"
                        value={endpointUrl}
                        onChange={(e) => setEndpointUrl(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Bearer Authorization Token (Optional)</label>
                    <input
                      type="password"
                      placeholder="Bearer token or API Secret Key"
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Connecting...' : '🔌 Add MCP Server'}
                  </button>
                </form>
              )}

              <hr className="divider" />

              <h3>Active MCP Connections ({mcpServers.length})</h3>
              {loading ? (
                <p className="loading-txt">Loading connections...</p>
              ) : mcpServers.length === 0 ? (
                <div className="empty-box">No external MCP servers connected yet.</div>
              ) : (
                <div className="mcp-list">
                  {mcpServers.map((server) => (
                    <div key={server.id} className="mcp-item">
                      <div className="mcp-item-info">
                        <div className="mcp-item-title">
                          <strong>{server.name}</strong>
                          <span className="transport-badge">{server.transport_type}</span>
                        </div>
                        <div className="mcp-url">{server.endpoint_url}</div>
                      </div>

                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteMCPServer(server.id)}
                          className="btn-danger-sm"
                          title="Disconnect MCP Server"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Per-Agent Dynamic Tool Bindings */}
            <div className="card">
              <div className="card-header">
                <h2>🤖 Per-Agent Dynamic Tool Allowlists</h2>
                <span className="card-sub">Configure exact tools callable by an agent instance</span>
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
                  <h4>Bind Tool to Agent</h4>
                  <div className="form-row">
                    <div className="form-group flex-2">
                      <input
                        type="text"
                        placeholder="Tool Name (e.g. check_order_status)"
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
                        <option value="mcp_http">MCP (HTTP)</option>
                        <option value="mcp_sse">MCP (SSE)</option>
                      </select>
                    </div>
                  </div>

                  {newToolConnector !== 'builtin' && mcpServers.length > 0 && (
                    <div className="form-group">
                      <label>Target MCP Server</label>
                      <select
                        value={newToolMcpServerId}
                        onChange={(e) => setNewToolMcpServerId(e.target.value)}
                      >
                        <option value="">Select MCP Server</option>
                        {mcpServers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="Description for LLM tool choice..."
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
                  <div className="empty-box">No tools bound. Agent has zero tool access.</div>
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
                    disabled={saving || !selectedAgentId}
                  >
                    {saving ? 'Saving...' : '💾 Save Runtime Agent Config (POST /api/v1/agents/id/config)'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>

        <style jsx>{`
          .mcp-page {
            min-height: 100vh;
            background: #f8fafc;
          }
          .mcp-main {
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
          .grid-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.75rem;
          }
          @media (max-width: 1024px) {
            .grid-container {
              grid-template-columns: 1fr;
            }
          }
          .card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 1.75rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.02);
            display: flex;
            flex-direction: column;
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
          .mcp-form {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-top: 1.25rem;
          }
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
            transition: border-color 0.2s;
          }
          .form-group input:focus, .form-group select:focus {
            border-color: #2563eb;
          }
          .form-row {
            display: flex;
            gap: 0.75rem;
          }
          .flex-1 { flex: 1; }
          .flex-2 { flex: 2; }
          .btn {
            border: none;
            padding: 0.65rem 1.25rem;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.2s;
          }
          .btn-primary {
            background: #2563eb;
            color: #ffffff;
          }
          .btn-primary:hover {
            background: #1d4ed8;
          }
          .btn-save {
            background: #16a34a;
            color: #ffffff;
            width: 100%;
            padding: 0.8rem;
            font-size: 0.95rem;
          }
          .btn-save:hover {
            background: #15803d;
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
          .btn-danger-sm {
            background: #fee2e2;
            color: #dc2626;
            border: 1px solid #fca5a5;
            padding: 0.35rem 0.6rem;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 700;
          }
          .mcp-list, .bindings-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            margin-top: 1rem;
          }
          .mcp-item, .binding-item {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 0.85rem 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .mcp-item-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .transport-badge {
            background: #e0e7ff;
            color: #4338ca;
            padding: 0.15rem 0.45rem;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
          }
          .mcp-url {
            font-size: 0.8rem;
            color: #64748b;
            margin-top: 0.2rem;
            word-break: break-all;
          }
          .agent-selector {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
            margin-top: 1rem;
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
          .type-builtin { background: #dcfce7; color: #15803d; }
          .type-mcp_http, .type-mcp_sse { background: #fef3c7; color: #b45309; }
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
          .section-subtitle {
            font-size: 0.95rem;
            font-weight: 700;
            color: #334155;
            margin: 0 0 0.5rem 0;
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
          .loading-txt {
            color: #64748b;
            font-size: 0.85rem;
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
