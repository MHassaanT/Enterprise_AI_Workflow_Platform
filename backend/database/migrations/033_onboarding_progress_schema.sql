-- Migration 033: Onboarding Progress Schema
-- Persists onboarding guide step completions per tenant with Row-Level Security

CREATE TABLE IF NOT EXISTS onboarding_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    step_id VARCHAR(100) NOT NULL,
    completed BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, step_id)
);

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_progress' AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON onboarding_progress
            USING (tenant_id = current_setting('app.tenant_id')::UUID);
    END IF;
END $$;
