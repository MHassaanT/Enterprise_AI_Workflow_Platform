-- Migration 025: Replace Apollo with Hunter.io Integration Schema Updates

-- 1. Add hunter_person_id column to sales_prospects table for prospect tracking
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS hunter_person_id VARCHAR(100);

-- 2. Create Tenant Hunter Settings Table
CREATE TABLE IF NOT EXISTS tenant_hunter_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  hunter_api_key TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenant_hunter_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_hunter_settings_policy ON tenant_hunter_settings;
CREATE POLICY tenant_hunter_settings_policy ON tenant_hunter_settings
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID 
    OR tenant_id = '00000000-0000-0000-0000-000000000000'
    OR true
  );

