-- Migration: 036_tenant_email_otps.sql
-- In-house Email OTP Authentication for Customer Support Agent

CREATE TABLE IF NOT EXISTS tenant_email_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by tenant and email
CREATE INDEX IF NOT EXISTS idx_tenant_email_otps_lookup 
ON tenant_email_otps (tenant_id, email, verified);

CREATE INDEX IF NOT EXISTS idx_tenant_email_otps_convo 
ON tenant_email_otps (tenant_id, conversation_id);

-- Register tool in tool_registry
INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
VALUES (
    'authenticate_user_with_email',
    'Email OTP Authentication',
    'builtin',
    false,
    '{
        "type": "object",
        "properties": {
            "email": {
                "type": "string",
                "description": "User email address to verify"
            },
            "action": {
                "type": "string",
                "enum": ["send_otp", "verify_otp"],
                "description": "''send_otp'' to generate and send a 6-digit verification code via Gmail, or ''verify_otp'' to check the code provided by the user"
            },
            "otp_code": {
                "type": "string",
                "description": "The 6-digit OTP code provided by the user (required when action is ''verify_otp'')"
            }
        },
        "required": ["email", "action"]
    }'::jsonb
)
ON CONFLICT (canonical_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    provider_type = EXCLUDED.provider_type,
    schema_json = EXCLUDED.schema_json;
