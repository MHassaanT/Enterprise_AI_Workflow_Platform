-- Migration 020: Procurement Agent Schema (Vendor Bids)

CREATE TABLE IF NOT EXISTS procurement_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bid_reference VARCHAR(100) NOT NULL UNIQUE,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_email VARCHAR(255) NOT NULL,
  quote_amount NUMERIC(15, 2) NOT NULL,
  equipment_details JSONB DEFAULT '{}'::jsonb,
  compliance_status VARCHAR(50) DEFAULT 'PENDING_ANALYSIS', -- COMPLIANT, NON_COMPLIANT, PENDING_ANALYSIS
  rag_citations JSONB DEFAULT '[]'::jsonb,
  budget_clearance_status VARCHAR(50) DEFAULT 'NOT_REQUESTED', -- REQUESTED, APPROVED, REJECTED
  status VARCHAR(50) DEFAULT 'PENDING_APPROVAL', -- PENDING_APPROVAL, APPROVED, REJECTED, PO_ISSUED
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE procurement_bids ENABLE ROW LEVEL SECURITY;
