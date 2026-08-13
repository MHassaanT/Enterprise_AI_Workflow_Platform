-- Stores job descriptions per tenant
CREATE TABLE hr_job_descriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(512) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT,        -- extracted key requirements (LLM-parsed or raw)
    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'closed', 'draft')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores uploaded resumes and their ranking results
CREATE TABLE hr_resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_description_id UUID NOT NULL REFERENCES hr_job_descriptions(id) ON DELETE CASCADE,
    candidate_name VARCHAR(255),
    candidate_email VARCHAR(255),
    filename VARCHAR(512) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    chunk_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'processing'
        CHECK (status IN ('processing', 'ready', 'failed')),
    rank_score FLOAT,                  -- LLM-generated composite score (0-100)
    rank_reasoning TEXT,               -- LLM explanation of ranking
    skills_matched JSONB DEFAULT '[]', -- matched skills array
    email_status VARCHAR(50) DEFAULT 'not_sent'
        CHECK (email_status IN ('not_sent', 'sent', 'failed')),
    email_sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE hr_job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_resumes ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY tenant_isolation_hr_jd ON hr_job_descriptions
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation_hr_resumes ON hr_resumes
    USING (tenant_id = current_setting('app.tenant_id')::UUID);
