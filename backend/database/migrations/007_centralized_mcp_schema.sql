-- Migration: 007_centralized_mcp_schema.sql
-- Centralized MCP Gateway: tool_registry, tool_credentials, enhanced tool_bindings, RLS

-- 1. Global Tool Registry
CREATE TABLE IF NOT EXISTS tool_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    provider_type VARCHAR(100) NOT NULL DEFAULT 'custom_http',
    is_high_risk BOOLEAN DEFAULT false,
    schema_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
VALUES
    ('check_order_status', 'Check Order Status', 'builtin', false,
        '{"type":"object","required":["order_id"],"properties":{"order_id":{"type":"string"}}}'::jsonb),
    ('escalate_to_human', 'Escalate to Human Agent', 'builtin', true,
        '{"type":"object","required":["reason"],"properties":{"reason":{"type":"string"}}}'::jsonb),
    ('airtable_search_records', 'Airtable Record Search', 'airtable', false,
        '{"type":"object","required":["base_id","table_name"],"properties":{"base_id":{"type":"string"},"table_name":{"type":"string"},"query":{"type":"string"}}}'::jsonb),
    ('airtable_create_record', 'Airtable Create Record', 'airtable', true,
        '{"type":"object","required":["base_id","table_name","fields"],"properties":{"base_id":{"type":"string"},"table_name":{"type":"string"},"fields":{"type":"object"}}}'::jsonb),
    ('resend_send_email', 'Send Email via Resend', 'resend', true,
        '{"type":"object","required":["to","subject","body"],"properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"from_address":{"type":"string"}}}'::jsonb),
    ('hubspot_get_contact', 'HubSpot Get Contact', 'hubspot', false,
        '{"type":"object","required":["email"],"properties":{"email":{"type":"string"}}}'::jsonb),
    ('hubspot_create_deal', 'HubSpot Create Deal', 'hubspot', true,
        '{"type":"object","required":["deal_name","amount"],"properties":{"deal_name":{"type":"string"},"amount":{"type":"number"},"contact_id":{"type":"string"}}}'::jsonb)
ON CONFLICT (canonical_name) DO NOTHING;

-- 2. Enhance existing tool_bindings table with registry linkage and overrides
ALTER TABLE tool_bindings
    ADD COLUMN IF NOT EXISTS tool_id UUID REFERENCES tool_registry(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS custom_risk_override BOOLEAN DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS config_json JSONB DEFAULT '{}'::jsonb;

-- Backfill tool_id from registry where names match
UPDATE tool_bindings tb
SET tool_id = tr.id
FROM tool_registry tr
WHERE tb.tool_name = tr.canonical_name
  AND tb.tool_id IS NULL;

-- 3. Encrypted Credentials table
CREATE TABLE IF NOT EXISTS tool_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    binding_id UUID REFERENCES tool_bindings(id) ON DELETE CASCADE,
    auth_type VARCHAR(50) NOT NULL DEFAULT 'api_key',
    encrypted_payload TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_credentials_binding ON tool_credentials(tenant_id, binding_id);
CREATE INDEX IF NOT EXISTS idx_tool_registry_provider ON tool_registry(provider_type);

-- 4. Row-Level Security (RLS) using null-safe current_setting
ALTER TABLE tool_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_credentials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tool_bindings' AND policyname = 'tenant_isolation_tool_bindings'
    ) THEN
        CREATE POLICY tenant_isolation_tool_bindings ON tool_bindings
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tool_credentials' AND policyname = 'tenant_isolation_tool_credentials'
    ) THEN
        CREATE POLICY tenant_isolation_tool_credentials ON tool_credentials
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
    END IF;
END $$;
