// src/lib/api.js

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ai_platform_token');
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem('ai_platform_user');
  try {
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
}

export function getAuthHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('ai_platform_token');
    localStorage.removeItem('ai_platform_user');
    window.location.href = '/login';
  }
}

function handleUnauthorized(res) {
  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('ai_platform_token');
    localStorage.removeItem('ai_platform_user');
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }
}

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let data = {};
    try { data = JSON.parse(text); } catch (e) {}
    console.error(`Login error [HTTP ${res.status}]:`, text);
    throw new Error(data.error || `Login failed (HTTP ${res.status}). Check backend logs or API URL.`);
  }

  const data = await res.json();
  if (data.token) {
    localStorage.setItem('ai_platform_token', data.token);
    if (data.user) {
      localStorage.setItem('ai_platform_user', JSON.stringify(data.user));
    }
  }
  return data;
}

export async function register(companyName, email, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName, email, password })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let data = {};
    try { data = JSON.parse(text); } catch (e) {}
    console.error(`Registration error [HTTP ${res.status}]:`, text);
    throw new Error(data.error || `Registration failed (HTTP ${res.status}). Check backend logs or database connection.`);
  }

  return res.json();
}

export async function fetchConversations() {
  const res = await fetch('/api/conversations', {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  const data = await res.json();
  return data.conversations || [];
}

export async function createConversation(customerIdentifier = 'Customer Inquiry') {
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ customerIdentifier })
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to create conversation');
  const data = await res.json();
  return data.conversation;
}

export async function fetchMessages(conversationId) {
  const res = await fetch(`/api/conversations/${conversationId}`, {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch messages');
  const data = await res.json();
  return data.messages || [];
}

export async function sendMessage(conversationId, content) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ content })
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to send message');
  }
  const data = await res.json();
  return data;
}

export async function fetchPendingApprovals() {
  const res = await fetch('/api/conversations/approvals/pending', {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch pending approvals');
  const data = await res.json();
  return data.approvals || [];
}

export async function patchApproval(approvalId, decision) {
  const res = await fetch(`/api/conversations/approvals/${approvalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ decision })
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to update approval');
  return res.json();
}

export async function fetchDocuments() {
  const res = await fetch('/api/documents', {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch documents');
  const data = await res.json();
  return data.documents || [];
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: { ...getAuthHeader() },
    body: formData,
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to upload document.');
  }
  return res.json();
}

export async function deleteDocument(documentId) {
  const res = await fetch(`/api/documents/${documentId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to delete document.');
  }
  return res.json();
}

// ── USER MANAGEMENT & PROVISIONING (ADMIN ONLY) ──
export async function fetchUsers() {
  const res = await fetch('/api/users', {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to fetch users');
  }
  const data = await res.json();
  return data.users || [];
}

export async function provisionReviewer(email, password) {
  const res = await fetch('/api/users/reviewers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ email, password })
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to provision reviewer account.');
  }
  return res.json();
}

// ── MCP CONNECTIONS & DYNAMIC AGENT TOOL BINDINGS ──
export async function fetchMCPServers() {
  const res = await fetch('/api/mcp', {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to fetch MCP servers');
  }
  const data = await res.json();
  return data.mcp_servers || [];
}

export async function createMCPServer(name, transportType, endpointUrl, authHeaders = {}) {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      name,
      transport_type: transportType,
      endpoint_url: endpointUrl,
      auth_headers: authHeaders,
    })
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to register MCP server connection');
  }
  return res.json();
}

export async function deleteMCPServer(id) {
  const res = await fetch(`/api/mcp/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to delete MCP server');
  }
  return res.json();
}

export async function fetchAgents() {
  const res = await fetch('/api/agents', {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to fetch agents');
  }
  const data = await res.json();
  return data.agents || [];
}

export async function fetchAgentConfig(agentId) {
  const res = await fetch(`/api/v1/agents/${agentId}/config`, {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to fetch agent config');
  }
  return res.json();
}

export async function updateAgentConfig(agentId, toolBindings, humanApprovalPolicy = []) {
  const res = await fetch(`/api/v1/agents/${agentId}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      tool_bindings: toolBindings,
      human_approval_policy: humanApprovalPolicy,
    })
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to update agent config');
  }
  return res.json();
}

// ── CENTRALIZED MCP GATEWAY & CREDENTIALS APIs ──
export async function fetchToolRegistry() {
  const res = await fetch('/api/mcp-gateway/registry', {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch tool registry');
  const data = await res.json();
  return data.registry || [];
}

export async function registerGlobalTool(canonicalName, displayName, providerType, isHighRisk, schemaJson = {}) {
  const res = await fetch('/api/mcp-gateway/registry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      canonical_name: canonicalName,
      display_name: displayName,
      provider_type: providerType,
      is_high_risk: isHighRisk,
      schema_json: schemaJson,
    })
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to register tool schema');
  return res.json();
}

export async function fetchGatewayBindings(agentInstanceId = '') {
  const url = agentInstanceId ? `/api/mcp-gateway/bindings?agent_instance_id=${agentInstanceId}` : '/api/mcp-gateway/bindings';
  const res = await fetch(url, {
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch gateway bindings');
  const data = await res.json();
  return data.bindings || [];
}

export async function saveGatewayBinding(bindingData) {
  const res = await fetch('/api/mcp-gateway/bindings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(bindingData)
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to save tool binding');
  return res.json();
}

export async function deleteGatewayBinding(bindingId) {
  const res = await fetch(`/api/mcp-gateway/bindings/${bindingId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() }
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to delete tool binding');
  return res.json();
}

export async function saveToolCredentials(bindingId, authType, payload) {
  const res = await fetch('/api/mcp-gateway/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      binding_id: bindingId,
      auth_type: authType,
      payload,
    })
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to encrypt and store credentials');
  return res.json();
}

export async function processApprovalAction(approvalId, action) {
  const res = await fetch(`/api/approvals/${approvalId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ action })
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error('Failed to process approval action');
  return res.json();
}

export async function connectIntegration(toolId, canonicalName, payload, authType = 'api_key') {
  const res = await fetch('/api/mcp-gateway/integrations/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      tool_id: toolId,
      canonical_name: canonicalName,
      auth_type: authType,
      payload,
    })
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to connect integration.');
  }
  return res.json();
}

export async function connectStripeCredentials(apiKey) {
  const res = await fetch('/api/integrations/stripe/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ api_key: apiKey }),
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to connect Stripe credentials.');
  }
  return res.json();
}



