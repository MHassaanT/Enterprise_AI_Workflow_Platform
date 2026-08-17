-- Migration 021: Sales Agent Schema (CRM Leads & Deals)

CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id VARCHAR(100) NOT NULL UNIQUE,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  tier_requested VARCHAR(100) DEFAULT 'Enterprise',
  deal_stage VARCHAR(50) DEFAULT 'QUALIFIED', -- QUALIFIED, QUOTE_SENT, CONTRACT_PENDING, CLOSED_WON, CLOSED_LOST
  total_value NUMERIC(15, 2) DEFAULT 0.00,
  discount_rate NUMERIC(5, 2) DEFAULT 0.00, -- Maximum allowed 15%
  quote_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
