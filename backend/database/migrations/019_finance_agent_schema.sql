-- Migration 019: Finance Agent Schema (Purchase Orders, Invoices, Department Budgets, General Ledger)

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_number VARCHAR(100) NOT NULL UNIQUE,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_email VARCHAR(255),
  amount NUMERIC(15, 2) NOT NULL,
  line_items JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'APPROVED', -- APPROVED, FULFILLED, CANCELLED
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number VARCHAR(100) NOT NULL,
  po_number VARCHAR(100),
  vendor_name VARCHAR(255),
  vendor_email VARCHAR(255),
  total_amount NUMERIC(15, 2) NOT NULL,
  line_items JSONB DEFAULT '[]'::jsonb,
  match_status VARCHAR(50) DEFAULT 'PENDING_MATCH', -- RECONCILED, FLAGGED_FOR_DISCREPANCY, PENDING_MATCH
  anomalies JSONB DEFAULT '[]'::jsonb,
  payment_draft JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, PAID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS department_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department VARCHAR(100) NOT NULL,
  total_budget NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  allocated_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  spent_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  reserved_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_tenant_dept UNIQUE(tenant_id, department)
);

CREATE TABLE IF NOT EXISTS general_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_code VARCHAR(50) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  forecasted_revenue NUMERIC(15, 2) DEFAULT 0.00,
  actual_revenue NUMERIC(15, 2) DEFAULT 0.00,
  actual_expense NUMERIC(15, 2) DEFAULT 0.00,
  transaction_type VARCHAR(50) NOT NULL, -- REVENUE_FORECAST, INVOICE_PAYMENT, PO_COMMITMENT, EXPENSE
  reference_id VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_ledger ENABLE ROW LEVEL SECURITY;
