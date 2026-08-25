-- Migration 030: AI Analytics Agent Schema & Executive Quick-View Views

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Daily aggregated snapshots table for fast executive dashboard loading
CREATE TABLE IF NOT EXISTS analytics_daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    active_employees INTEGER DEFAULT 0,
    attendance_rate NUMERIC(5, 2) DEFAULT 0.00,
    total_budget NUMERIC(15, 2) DEFAULT 0.00,
    total_spent NUMERIC(15, 2) DEFAULT 0.00,
    active_projects INTEGER DEFAULT 0,
    sales_leads_count INTEGER DEFAULT 0,
    sales_qualified_count INTEGER DEFAULT 0,
    procurement_requests_count INTEGER DEFAULT 0,
    procurement_spend NUMERIC(15, 2) DEFAULT 0.00,
    agent_executions_count INTEGER DEFAULT 0,
    llm_tokens_used INTEGER DEFAULT 0,
    metrics_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_snapshot_date UNIQUE(tenant_id, snapshot_date)
);

-- 2. Anomaly & Risk Alerts table
CREATE TABLE IF NOT EXISTS analytics_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type VARCHAR(100) NOT NULL, -- BUDGET_OVERRUN, ABSENTEEISM_SPIKE, CONVERSION_DROP, LLM_TOKEN_SURGE, VENDOR_COST_SPIKE
    severity VARCHAR(50) NOT NULL DEFAULT 'WARNING', -- INFO, WARNING, CRITICAL
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    metric_name VARCHAR(100),
    current_value NUMERIC(15, 2),
    threshold_value NUMERIC(15, 2),
    is_resolved BOOLEAN DEFAULT FALSE,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Executive Saved Reports table
CREATE TABLE IF NOT EXISTS analytics_saved_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_title VARCHAR(255) NOT NULL,
    report_type VARCHAR(100) DEFAULT 'EXECUTIVE_DIGEST', -- EXECUTIVE_DIGEST, FINANCIAL_AUDIT, HR_ATTENDANCE, CROSS_AGENT_ROI
    period_start DATE,
    period_end DATE,
    summary_markdown TEXT NOT NULL,
    key_takeaways JSONB DEFAULT '[]'::jsonb,
    charts_payload JSONB DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE analytics_daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_saved_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS tenant_isolation_analytics_snapshots ON analytics_daily_snapshots;
CREATE POLICY tenant_isolation_analytics_snapshots ON analytics_daily_snapshots
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_analytics_alerts ON analytics_alerts;
CREATE POLICY tenant_isolation_analytics_alerts ON analytics_alerts
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_analytics_reports ON analytics_saved_reports;
CREATE POLICY tenant_isolation_analytics_reports ON analytics_saved_reports
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_tenant_date ON analytics_daily_snapshots(tenant_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_alerts_tenant_resolved ON analytics_alerts(tenant_id, is_resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_reports_tenant ON analytics_saved_reports(tenant_id, created_at DESC);
