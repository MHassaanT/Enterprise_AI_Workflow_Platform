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

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
