-- Migration: 013_seed_refund_tool.sql
-- Seed the submit_refund_request tool into tool_registry

WITH upsert AS (
    INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
    VALUES
        (
            'submit_refund_request',
            'Submit Refund Request',
            'builtin',
            true,
            '{"type":"object","required":["order_id","customer_name","customer_email","order_details","refund_reason"], "properties": {"order_id": {"type": "string"}, "customer_name": {"type": "string"}, "customer_email": {"type": "string"}, "order_details": {"type": "string"}, "refund_reason": {"type": "string"}}}'::jsonb
        )
    ON CONFLICT (canonical_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider_type = EXCLUDED.provider_type,
        is_high_risk = EXCLUDED.is_high_risk,
        schema_json = EXCLUDED.schema_json
    RETURNING *
)
SELECT * FROM upsert;