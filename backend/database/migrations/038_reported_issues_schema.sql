-- Migration 038: Reported Issues Schema
-- Cross-agent issue escalation: Customer Support Agent → Coding Agent → Human Approval
--
-- Tracks issues that the Customer Support Agent could not resolve from KB/DB,
-- through Coding Agent investigation, to human review and resolution.

CREATE TABLE IF NOT EXISTS reported_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id),

    -- Issue details (populated by Customer Support Agent)
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    customer_message TEXT,                  -- Original customer complaint verbatim
    category VARCHAR(100) DEFAULT 'unknown',
        -- 'bug_report', 'feature_gap', 'data_issue', 'unknown'
    severity VARCHAR(50) DEFAULT 'medium',
        -- 'low', 'medium', 'high', 'critical'

    -- Coding Agent investigation results
    investigation_status VARCHAR(50) DEFAULT 'pending'
        CHECK (investigation_status IN ('pending', 'investigating', 'completed', 'skipped', 'failed')),
    investigation_repo VARCHAR(255),        -- GitHub repo analyzed (e.g. 'owner/repo')
    investigation_branch VARCHAR(255),      -- Branch analyzed
    investigation_findings TEXT,            -- LLM analysis summary from Coding Agent
    investigated_files JSONB DEFAULT '[]',  -- [{path, relevance, snippet}]
    root_cause TEXT,                        -- Identified root cause or "no code issue found"

    -- Human approval link (created by Coding Agent after investigation)
    approval_id UUID REFERENCES approval_requests(id),

    -- Widget visibility (human can toggle which issues appear in customer widget)
    show_in_widget BOOLEAN DEFAULT false,

    -- Lifecycle
    status VARCHAR(50) DEFAULT 'open'
        CHECK (status IN ('open', 'investigating', 'awaiting_review', 'fixing', 'resolved', 'dismissed', 'no_code_issue')),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),               -- 'coding_agent', 'human', 'auto'
    resolution_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_reported_issues_tenant_status
    ON reported_issues(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reported_issues_tenant_investigation
    ON reported_issues(tenant_id, investigation_status);
CREATE INDEX IF NOT EXISTS idx_reported_issues_created
    ON reported_issues(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reported_issues_widget
    ON reported_issues(tenant_id, show_in_widget) WHERE show_in_widget = true;

-- Row-Level Security
ALTER TABLE reported_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reported_issues_tenant_isolation ON reported_issues;
CREATE POLICY reported_issues_tenant_isolation ON reported_issues
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

SELECT 'Migration 038 completed successfully' AS migration_status;
