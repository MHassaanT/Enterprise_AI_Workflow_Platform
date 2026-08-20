-- Migration 027: Procurement Multi-Agent System Schema (V2)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS procurement_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    budget_limit NUMERIC(15, 2) DEFAULT 0.00,
    department VARCHAR(100) DEFAULT 'General',
    target_completion_date TIMESTAMPTZ,
    current_stage VARCHAR(50) DEFAULT 'INTAKE', -- INTAKE, RESEARCHED, RFQ_DISPATCHED, REPLIES_PARSED, AWAITING_SELECTION, VENDOR_SELECTED, NOTIFIED, COMPLETED
    active_subagent VARCHAR(50) DEFAULT 'intake_spec',
    extracted_specs JSONB DEFAULT '{}'::jsonb,
    research_report JSONB DEFAULT '{}'::jsonb,
    comparison_matrix JSONB DEFAULT '{}'::jsonb,
    selected_vendor_id UUID,
    selection_notes TEXT,
    final_report JSONB DEFAULT '{}'::jsonb,
    po_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS procurement_vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    procurement_id UUID REFERENCES procurement_requests(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vendor_name VARCHAR(255) NOT NULL,
    vendor_email VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    deliverability_status VARCHAR(50) DEFAULT 'UNVERIFIED',
    contact_status VARCHAR(50) DEFAULT 'DISCOVERED', -- DISCOVERED, RFQ_SENT, REPLIED, SHORTLISTED, SELECTED, REJECTED
    quote_amount NUMERIC(15, 2) DEFAULT 0.00,
    lead_time_days INTEGER DEFAULT 0,
    sla_terms TEXT,
    payment_terms VARCHAR(255),
    received_quote_payload JSONB DEFAULT '{}'::jsonb,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS procurement_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    procurement_id UUID REFERENCES procurement_requests(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    parsed_text TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS procurement_agent_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    procurement_id UUID REFERENCES procurement_requests(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subagent_name VARCHAR(100) NOT NULL,
    action VARCHAR(255) NOT NULL,
    log_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient multi-tenant queries and stage filtering
CREATE INDEX IF NOT EXISTS idx_procurement_requests_tenant ON procurement_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_procurement_requests_stage ON procurement_requests(current_stage);
CREATE INDEX IF NOT EXISTS idx_procurement_vendors_procurement ON procurement_vendors(procurement_id);
CREATE INDEX IF NOT EXISTS idx_procurement_vendors_status ON procurement_vendors(contact_status);
CREATE INDEX IF NOT EXISTS idx_procurement_docs_procurement ON procurement_documents(procurement_id);
CREATE INDEX IF NOT EXISTS idx_procurement_logs_procurement ON procurement_agent_logs(procurement_id);
