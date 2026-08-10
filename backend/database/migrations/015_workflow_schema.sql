CREATE TABLE IF NOT EXISTS workflows (
    workflow_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    definition JSONB NOT NULL,
    status VARCHAR(50) CHECK (status IN ('active', 'draft', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(workflow_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    triggered_by VARCHAR(50),
    trigger_context JSONB,
    execution_state JSONB,
    status VARCHAR(50) CHECK (status IN ('running', 'success', 'failed', 'awaiting_approval', 'timeout')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    result_data JSONB
);

CREATE TABLE IF NOT EXISTS workflow_run_steps (
    step_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
    node_id VARCHAR(100),
    node_type VARCHAR(50),
    input_data JSONB,
    output_data JSONB,
    status VARCHAR(50) CHECK (status IN ('completed', 'failed', 'skipped')),
    duration_ms INT,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    error_message TEXT,
    mcp_tool_used VARCHAR(255),
    approval_id UUID REFERENCES approval_requests(id) ON DELETE SET NULL
);

ALTER TABLE approval_requests 
ADD COLUMN IF NOT EXISTS workflow_run_id UUID REFERENCES workflow_runs(run_id) ON DELETE CASCADE;
