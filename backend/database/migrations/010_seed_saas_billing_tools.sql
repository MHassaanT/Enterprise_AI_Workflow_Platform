-- Migration: 010_seed_saas_billing_tools.sql
-- Integration Hub Seeding: Airtable, HubSpot, ClickUp, and Stripe integrations

WITH upsert AS (
    INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
    VALUES
        (
            'Airtable',
            'Airtable Relational DB',
            'airtable',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"airtable_search_records or airtable_create_record"},"base_id":{"type":"string"},"table_name":{"type":"string"},"query":{"type":"string"},"fields":{"type":"object"}}}'::jsonb
        ),
        (
            'HubSpot',
            'HubSpot CRM Platform',
            'hubspot',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"hubspot_get_contact, hubspot_create_deal, or hubspot_create_ticket"},"email":{"type":"string"},"deal_name":{"type":"string"},"amount":{"type":"number"},"subject":{"type":"string"},"content":{"type":"string"}}}'::jsonb
        ),
        (
            'ClickUp',
            'ClickUp Project Workspace',
            'clickup',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"clickup_get_tasks or clickup_create_task"},"list_id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"status":{"type":"string"},"assignees":{"type":"array","items":{"type":"number"}}}}'::jsonb
        ),
        (
            'Stripe',
            'Stripe B2B Billing & Payments',
            'stripe',
            true,
            '{"type":"object","properties":{"action":{"type":"string","description":"stripe_check_subscription, stripe_process_refund, or stripe_get_customer"},"customer_id":{"type":"string"},"charge_id":{"type":"string"},"amount":{"type":"number"},"reason":{"type":"string"}}}'::jsonb
        )
    ON CONFLICT (canonical_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider_type = EXCLUDED.provider_type,
        is_high_risk = EXCLUDED.is_high_risk,
        schema_json = EXCLUDED.schema_json
    RETURNING *
)
SELECT * FROM upsert;
