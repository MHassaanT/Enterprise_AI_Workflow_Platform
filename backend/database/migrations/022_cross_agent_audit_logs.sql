-- Migration 022: Cross Agent Audit Logs

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name VARCHAR(100) NOT NULL, -- FinanceAgent, ProcurementAgent, SalesAgent, SupervisorGraph
  subagent_name VARCHAR(100),
  action VARCHAR(150) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  reasoning TEXT,
  citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if table was already created in 001_initial_schema
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS agent_name VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS subagent_name VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(150);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reasoning TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS citations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE audit_logs ALTER COLUMN event_type DROP NOT NULL;

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
