-- Migration 044: Finance Agent Payment Redesign
-- Supports autonomous multi-account payment intelligence across SafePay and Stripe MCPs

CREATE TABLE IF NOT EXISTS finance_payment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'stripe', 'safepay', 'combined'
  period_days INTEGER DEFAULT 30,
  gross_volume_usd NUMERIC(15, 2) DEFAULT 0.00,
  net_volume_usd NUMERIC(15, 2) DEFAULT 0.00,
  refunds_volume_usd NUMERIC(15, 2) DEFAULT 0.00,
  total_transactions INTEGER DEFAULT 0,
  successful_transactions INTEGER DEFAULT 0,
  failed_transactions INTEGER DEFAULT 0,
  success_rate NUMERIC(5, 2) DEFAULT 100.00,
  balances JSONB DEFAULT '{}'::jsonb,
  timeline JSONB DEFAULT '[]'::jsonb,
  distribution JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optimized lookups for tenant payment credentials and webhook events
CREATE INDEX IF NOT EXISTS idx_finance_snapshots_tenant ON finance_payment_snapshots(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_tool_credentials_tenant_id ON tool_credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type_time ON webhook_events(event_type, created_at);

-- Row Level Security
ALTER TABLE finance_payment_snapshots ENABLE ROW LEVEL SECURITY;
