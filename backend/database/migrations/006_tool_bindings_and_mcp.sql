-- Migration: 006_tool_bindings_and_mcp.sql
-- Description: Supports dynamic MCP connections, per-agent ToolBinding allowlists, and runtime agent configurations.

CREATE TABLE IF NOT EXISTS mcp_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    transport_type VARCHAR(50) NOT NULL DEFAULT 'http' CHECK (transport_type IN ('sse', 'http', 'stdio', 'builtin')),
    endpoint_url TEXT,
    auth_headers JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_bindings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_instance_id UUID NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tool_name VARCHAR(255) NOT NULL,
    connector_type VARCHAR(100) DEFAULT 'builtin' CHECK (connector_type IN ('builtin', 'mcp_sse', 'mcp_http', 'mcp_stdio')),
    mcp_server_id UUID REFERENCES mcp_servers(id) ON DELETE SET NULL,
    config JSONB DEFAULT '{}'::jsonb,
    is_high_risk BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_agent_tool UNIQUE(agent_instance_id, tool_name)
);

-- Index for fast runtime tool lookup by agent_instance_id
CREATE INDEX IF NOT EXISTS idx_tool_bindings_agent ON tool_bindings(agent_instance_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id);
