-- Migration: 012_seed_gmail_tool.sql
-- Integration Hub Seeding: Gmail via Google OAuth2

WITH upsert AS (
    INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
    VALUES
        (
            'Gmail',
            'Gmail (Google Workspace)',
            'gmail',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"gmail_search_inbox, gmail_read_thread, or gmail_send_email"},"q":{"type":"string"},"limit":{"type":"number"},"id":{"type":"string"},"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"}}}'::jsonb
        )
    ON CONFLICT (canonical_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider_type = EXCLUDED.provider_type,
        is_high_risk = EXCLUDED.is_high_risk,
        schema_json = EXCLUDED.schema_json
    RETURNING *
)
SELECT * FROM upsert;
