-- Migration: 009_seed_vercel_github.sql
-- Integration Hub Seeding: GitHub and Vercel OAuth2 integrations

WITH upsert AS (
    INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
    VALUES
        (
            'GitHub',
            'GitHub Developer Platform',
            'github',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"create_branch, get_issues, get_pull_requests, or trigger_workflow"},"owner":{"type":"string"},"repo":{"type":"string"},"branch_name":{"type":"string"},"base_branch":{"type":"string"},"issue_number":{"type":"number"},"pull_number":{"type":"number"},"workflow_id":{"type":"string"},"ref":{"type":"string"}}}'::jsonb
        ),
        (
            'Vercel',
            'Vercel Cloud Platform',
            'vercel',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"list_deployments or get_deployment_status"},"project_id":{"type":"string"},"deployment_id":{"type":"string"},"limit":{"type":"number"}}}'::jsonb
        )
    ON CONFLICT (canonical_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider_type = EXCLUDED.provider_type,
        is_high_risk = EXCLUDED.is_high_risk,
        schema_json = EXCLUDED.schema_json
    RETURNING *
)
SELECT * FROM upsert;
