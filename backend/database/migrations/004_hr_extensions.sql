-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 004: HR Agent Extensions
-- Email Intake, Talent Pool ("Future Prospects"), Project & Team Management
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════
-- 1. hr_open_roles — Open job positions accepting applications via email
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_open_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    requirements    TEXT,
    search_query    TEXT DEFAULT 'subject:job application',
    accepting_until TIMESTAMPTZ NOT NULL,
    status          TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'filled')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 2. hr_applications — Applications received via email polling
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    open_role_id        UUID NOT NULL REFERENCES hr_open_roles(id) ON DELETE CASCADE,
    applicant_name      TEXT NOT NULL,
    applicant_email     TEXT NOT NULL,
    email_subject       TEXT,
    email_body          TEXT,
    email_message_id    TEXT,
    resume_text         TEXT,
    resume_filename     TEXT,
    status              TEXT DEFAULT 'received' CHECK (status IN ('received', 'processing', 'ready', 'shortlisted', 'rejected', 'interview_scheduled', 'failed')),
    rank_score          FLOAT,
    rank_reasoning      TEXT,
    skills_matched      JSONB,
    ack_email_sent      BOOLEAN DEFAULT FALSE,
    ack_email_sent_at   TIMESTAMPTZ,
    chunk_count         INT DEFAULT 0,
    source              TEXT DEFAULT 'email' CHECK (source IN ('email', 'talent_pool_transfer')),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 3. hr_talent_pool — "Future Prospects" — unmatched applications
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_talent_pool (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    applicant_name      TEXT NOT NULL,
    applicant_email     TEXT NOT NULL,
    email_subject       TEXT,
    email_body          TEXT,
    email_message_id    TEXT,
    resume_text         TEXT,
    resume_filename     TEXT,
    desired_role        TEXT,
    status              TEXT DEFAULT 'pooled' CHECK (status IN ('pooled', 'transferred', 'notified')),
    transferred_to_role UUID REFERENCES hr_open_roles(id),
    transferred_at      TIMESTAMPTZ,
    notification_sent   BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 4. hr_employees — Company employee registry
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    position        TEXT NOT NULL,
    department      TEXT,
    hire_date       DATE,
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'terminated')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- ═══════════════════════════════════════════════════════
-- 5. hr_projects — Company projects
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_projects (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    name                    TEXT NOT NULL,
    description             TEXT,
    start_date              DATE NOT NULL,
    expected_completion     DATE NOT NULL,
    actual_completion       DATE,
    status                  TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
    current_progress        INT DEFAULT 0 CHECK (current_progress >= 0 AND current_progress <= 100),
    last_update_summary     TEXT,
    last_update_at          TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 6. hr_project_members — Links employees to projects
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_project_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES hr_projects(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    role            TEXT DEFAULT 'member',
    responsibilities TEXT,
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, employee_id)
);

-- ═══════════════════════════════════════════════════════
-- 7. hr_project_updates — Status updates from team members
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_project_updates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES hr_projects(id) ON DELETE CASCADE,
    submitted_by    UUID NOT NULL REFERENCES hr_employees(id),
    progress_pct    INT CHECK (progress_pct >= 0 AND progress_pct <= 100),
    notes           TEXT NOT NULL,
    blockers        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 8. hr_email_polling_state — Tracks last polled email for HR
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_email_polling_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    last_processed_message_ids  JSONB DEFAULT '[]'::jsonb,
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- ═══════════════════════════════════════════════════════
-- Performance Indexes
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_hr_open_roles_tenant ON hr_open_roles(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_applications_role ON hr_applications(open_role_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_applications_email_msg ON hr_applications(email_message_id);
CREATE INDEX IF NOT EXISTS idx_hr_talent_pool_tenant ON hr_talent_pool(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_talent_pool_email_msg ON hr_talent_pool(email_message_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_tenant ON hr_employees(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_projects_tenant ON hr_projects(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_project_members_project ON hr_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_hr_project_updates_project ON hr_project_updates(project_id, created_at DESC);

COMMIT;
