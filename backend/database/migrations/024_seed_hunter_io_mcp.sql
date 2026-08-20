-- Migration: 024_seed_hunter_io_mcp.sql
-- Integration Hub Seeding: Hunter.io B2B Email Intelligence, Discovery & Enrichment API v2

WITH upsert AS (
    INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
    VALUES
        (
            'Hunter.io',
            'Hunter.io Email Intelligence',
            'hunter',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"discover, domain_search, email_finder, verify_email, company_enrichment, person_enrichment, combined_enrichment, or account_info"},"domain":{"type":"string"},"email":{"type":"string"},"first_name":{"type":"string"},"last_name":{"type":"string"},"company":{"type":"string"},"query":{"type":"object"}}}'::jsonb
        ),
        (
            'hunter_discover',
            'Hunter Lead Discover',
            'hunter',
            false,
            '{"type":"object","properties":{"query":{"type":"object","description":"Search query criteria object (e.g. company domain, industry, location, title filter)"},"limit":{"type":"integer","description":"Max results to return"}}}'::jsonb
        ),
        (
            'hunter_domain_search',
            'Hunter Domain Search',
            'hunter',
            false,
            '{"type":"object","required":["domain"],"properties":{"domain":{"type":"string","description":"Target company domain (e.g. stripe.com)"},"limit":{"type":"integer","description":"Max email results to return"},"type":{"type":"string","description":"Filter by personal or generic emails"}}}'::jsonb
        ),
        (
            'hunter_email_finder',
            'Hunter Email Finder',
            'hunter',
            false,
            '{"type":"object","required":["domain","first_name","last_name"],"properties":{"domain":{"type":"string","description":"Target company domain"},"first_name":{"type":"string","description":"First name of contact"},"last_name":{"type":"string","description":"Last name of contact"}}}'::jsonb
        ),
        (
            'hunter_verify_email',
            'Hunter Email Verifier',
            'hunter',
            false,
            '{"type":"object","required":["email"],"properties":{"email":{"type":"string","description":"Email address to verify deliverability"}}}'::jsonb
        ),
        (
            'hunter_company_enrichment',
            'Hunter Company Enrichment',
            'hunter',
            false,
            '{"type":"object","required":["domain"],"properties":{"domain":{"type":"string","description":"Target company domain (e.g. stripe.com)"}}}'::jsonb
        ),
        (
            'hunter_person_enrichment',
            'Hunter Person Enrichment',
            'hunter',
            false,
            '{"type":"object","required":["email"],"properties":{"email":{"type":"string","description":"Email address of person to enrich"}}}'::jsonb
        ),
        (
            'hunter_combined_enrichment',
            'Hunter Combined Enrichment',
            'hunter',
            false,
            '{"type":"object","required":["email"],"properties":{"email":{"type":"string","description":"Email address for combined person and company enrichment"}}}'::jsonb
        ),
        (
            'hunter_account_info',
            'Hunter Account Quota & Info',
            'hunter',
            false,
            '{"type":"object","properties":{}}'::jsonb
        )
    ON CONFLICT (canonical_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider_type = EXCLUDED.provider_type,
        is_high_risk = EXCLUDED.is_high_risk,
        schema_json = EXCLUDED.schema_json
    RETURNING *
)
SELECT * FROM upsert;
