-- Migration: 041_enhance_tenant_otps_whatsapp.sql
-- Adds phone number and WhatsApp channel support to tenant_email_otps

-- 1. Allow email to be nullable when phone is used
ALTER TABLE tenant_email_otps ALTER COLUMN email DROP NOT NULL;

-- 2. Add phone and channel columns
ALTER TABLE tenant_email_otps 
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp'));

-- 3. Create index for fast lookup by tenant and phone
CREATE INDEX IF NOT EXISTS idx_tenant_email_otps_phone 
ON tenant_email_otps (tenant_id, phone, verified);

-- 4. Ensure at least one identifier (email or phone) is provided
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_otps_identifier'
    ) THEN
        ALTER TABLE tenant_email_otps 
        ADD CONSTRAINT chk_tenant_otps_identifier 
        CHECK (email IS NOT NULL OR phone IS NOT NULL);
    END IF;
END $$;

-- 5. Update tool_registry with enhanced multi-channel schema
INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
VALUES (
    'authenticate_user_with_email',
    'User OTP Authentication (Email & WhatsApp)',
    'builtin',
    false,
    '{
        "type": "object",
        "properties": {
            "email": {
                "type": "string",
                "description": "User email address to verify via Email OTP"
            },
            "phone": {
                "type": "string",
                "description": "User phone number to verify via WhatsApp OTP"
            },
            "action": {
                "type": "string",
                "enum": ["send_otp", "verify_otp"],
                "description": "''send_otp'' to generate and send a 6-digit verification code via WhatsApp or Email, or ''verify_otp'' to check the code provided by the user"
            },
            "otp_code": {
                "type": "string",
                "description": "The 6-digit OTP code provided by the user (required when action is ''verify_otp'')"
            }
        },
        "required": ["action"]
    }'::jsonb
)
ON CONFLICT (canonical_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    provider_type = EXCLUDED.provider_type,
    schema_json = EXCLUDED.schema_json;

-- Also register alias authenticate_user
INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
VALUES (
    'authenticate_user',
    'User OTP Authentication (Email & WhatsApp)',
    'builtin',
    false,
    '{
        "type": "object",
        "properties": {
            "email": {
                "type": "string",
                "description": "User email address to verify via Email OTP"
            },
            "phone": {
                "type": "string",
                "description": "User phone number to verify via WhatsApp OTP"
            },
            "action": {
                "type": "string",
                "enum": ["send_otp", "verify_otp"],
                "description": "''send_otp'' to generate and send a 6-digit verification code via WhatsApp or Email, or ''verify_otp'' to check the code provided by the user"
            },
            "otp_code": {
                "type": "string",
                "description": "The 6-digit OTP code provided by the user (required when action is ''verify_otp'')"
            }
        },
        "required": ["action"]
    }'::jsonb
)
ON CONFLICT (canonical_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    provider_type = EXCLUDED.provider_type,
    schema_json = EXCLUDED.schema_json;
