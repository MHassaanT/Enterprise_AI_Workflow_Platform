-- Migration: 008_seed_safepay_supabase.sql
-- Integration Hub Seeding: SafePay and Supabase integrations & tool_credentials schema update

-- 1. Ensure tool_credentials table has tool_id for tool-level credentials
ALTER TABLE tool_credentials
    ADD COLUMN IF NOT EXISTS tool_id UUID REFERENCES tool_registry(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tool_credentials_tenant_tool ON tool_credentials(tenant_id, tool_id);

-- 2. Seed tool_registry with SafePay and Supabase
WITH upsert AS (
    INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
    VALUES
        (
            'SafePay',
            'SafePay Payments',
            'safepay',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"safepay_verify_transaction or safepay_generate_link"},"transaction_id":{"type":"string"},"amount":{"type":"number"},"currency":{"type":"string"}}}'::jsonb
        ),
        (
            'Supabase',
            'Supabase Database Hub',
            'supabase',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"select, insert, update, delete"},"table":{"type":"string"},"query":{"type":"object"},"payload":{"type":"object"}}}'::jsonb
        )
    ON CONFLICT (canonical_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider_type = EXCLUDED.provider_type,
        is_high_risk = EXCLUDED.is_high_risk,
        schema_json = EXCLUDED.schema_json
    RETURNING *
)
SELECT * FROM upsert;