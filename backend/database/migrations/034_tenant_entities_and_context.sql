-- Migration: 034_tenant_entities_and_context.sql
-- Description: Tenant-configurable entity schema + agent context for dynamic support agent

-- 1. Tenant Entity Schema Configuration
CREATE TABLE IF NOT EXISTS tenant_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100) DEFAULT 'box',
    data_source_type VARCHAR(50) NOT NULL DEFAULT 'internal_api' 
        CHECK (data_source_type IN ('internal_api', 'integration', 'custom_api')),
    data_source_config JSONB DEFAULT '{}'::jsonb,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_entity UNIQUE(tenant_id, entity_name)
);

-- 2. Entity Fields
CREATE TABLE IF NOT EXISTS tenant_entity_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES tenant_entities(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    field_type VARCHAR(50) NOT NULL 
        CHECK (field_type IN ('string', 'number', 'boolean', 'enum', 'date', 'datetime', 'reference', 'json', 'email', 'url')),
    is_required BOOLEAN DEFAULT false,
    is_searchable BOOLEAN DEFAULT true,
    is_filterable BOOLEAN DEFAULT true,
    enum_values JSONB DEFAULT NULL,
    reference_entity_id UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_entity_field UNIQUE(entity_id, field_name)
);

-- 3. Entity Operations
CREATE TABLE IF NOT EXISTS tenant_entity_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES tenant_entities(id) ON DELETE CASCADE,
    operation_name VARCHAR(50) NOT NULL 
        CHECK (operation_name IN ('search', 'get_by_id', 'create', 'update', 'delete', 'count')),
    is_enabled BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT false,
    custom_endpoint VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_entity_operation UNIQUE(entity_id, operation_name)
);

-- 4. Tenant Agent Context
CREATE TABLE IF NOT EXISTS tenant_agent_context (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_type VARCHAR(50) NOT NULL DEFAULT 'customer_support'
        CHECK (agent_type IN ('customer_support', 'sales', 'hr', 'finance')),
    company_name VARCHAR(255),
    company_description TEXT,
    support_tone VARCHAR(50) DEFAULT 'professional' 
        CHECK (support_tone IN ('professional', 'friendly', 'technical', 'casual')),
    auto_escalate_keywords JSONB DEFAULT '[]'::jsonb,
    auto_escalate_after_attempts INT DEFAULT 3,
    max_tool_calls_per_turn INT DEFAULT 5,
    enable_proactive_suggestions BOOLEAN DEFAULT true,
    custom_system_instructions TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_agent UNIQUE(tenant_id, agent_type)
);

-- 5. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'open' 
        CHECK (status IN ('open', 'diagnosing', 'waiting_on_user', 'resolved', 'escalated', 'closed')),
    priority VARCHAR(20) DEFAULT 'medium' 
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    category VARCHAR(100),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    agent_notes JSONB DEFAULT '[]'::jsonb,
    resolution_summary TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Ticket Notes
CREATE TABLE IF NOT EXISTS support_ticket_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    author_type VARCHAR(20) NOT NULL 
        CHECK (author_type IN ('ai_agent', 'human_agent', 'system')),
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_entities_tenant ON tenant_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entity_fields_entity ON tenant_entity_fields(entity_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_conversation ON support_tickets(conversation_id);

-- RLS
ALTER TABLE tenant_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entity_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entity_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_agent_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_entities ON tenant_entities
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
CREATE POLICY tenant_isolation_entity_fields ON tenant_entity_fields
    USING (entity_id IN (SELECT id FROM tenant_entities WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID));
CREATE POLICY tenant_isolation_entity_ops ON tenant_entity_operations
    USING (entity_id IN (SELECT id FROM tenant_entities WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID));
CREATE POLICY tenant_isolation_agent_context ON tenant_agent_context
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
CREATE POLICY tenant_isolation_tickets ON support_tickets
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
CREATE POLICY tenant_isolation_ticket_notes ON support_ticket_notes
    USING (ticket_id IN (SELECT id FROM support_tickets WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID));

-- Seed defaults
INSERT INTO tenant_agent_context (tenant_id, agent_type, company_name, support_tone)
SELECT id, 'customer_support', name, 'professional' FROM tenants
ON CONFLICT (tenant_id, agent_type) DO NOTHING;
