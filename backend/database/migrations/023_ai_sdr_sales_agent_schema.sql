-- Migration 023: AI SDR Sales Agent Schema (ICP Configs, Prospects, Apollo Settings, Pipeline Logs)

-- 1. Tenant Apollo Settings Table
CREATE TABLE IF NOT EXISTS tenant_apollo_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  apollo_api_key TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sales ICP Configurations Table
CREATE TABLE IF NOT EXISTS sales_icp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  target_industries JSONB DEFAULT '["Software", "SaaS", "Fintech", "Healthcare"]'::jsonb,
  target_titles JSONB DEFAULT '["VP of Sales", "CTO", "Head of Growth", "Director of IT"]'::jsonb,
  company_size_min INT DEFAULT 10,
  company_size_max INT DEFAULT 1000,
  battlecard_notes TEXT DEFAULT 'Key Differentiators: Autonomous workflow orchestration, zero-vendor lock-in, 99.9% uptime SLA.',
  pricing_tiers JSONB DEFAULT '{"Professional": 50000, "Enterprise": 100000}'::jsonb,
  playbook_strategy TEXT DEFAULT 'Focus on operational efficiency, credit cost savings, and rapid ROI in Q3/Q4.',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sales Prospects Table (AI SDR Pipeline Lead Pipeline)
CREATE TABLE IF NOT EXISTS sales_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_title VARCHAR(255),
  icp_score NUMERIC(5, 2) DEFAULT 0.00,
  deliverability_status VARCHAR(50) DEFAULT 'UNVERIFIED', -- VALID, CATCH_ALL, DISPOSABLE, INVALID, UNVERIFIED
  scraped_context TEXT,
  outreach_subject VARCHAR(500),
  outreach_body TEXT,
  deal_stage VARCHAR(50) DEFAULT 'DISCOVERED', -- DISCOVERED, RESEARCHED, QUALIFIED, OUTREACH_SENT, DEMO_SCHEDULED, QUOTE_ISSUED, CLOSED_WON, DISCARDED
  quote_details JSONB DEFAULT '{}'::jsonb,
  apollo_person_id VARCHAR(100),
  gmail_message_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sales Pipeline Audit Logs
CREATE TABLE IF NOT EXISTS sales_pipeline_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id VARCHAR(100) NOT NULL,
  stage_name VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL, -- IN_PROGRESS, COMPLETED, FAILED, SKIPPED
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tenant_apollo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_icp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_pipeline_logs ENABLE ROW LEVEL SECURITY;

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_prospects_tenant ON sales_prospects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_domain ON sales_prospects(domain);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_email ON sales_prospects(contact_email);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_logs_run ON sales_pipeline_logs(run_id);
