-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 018: HR Employee Attendance & Office Geofence / Network Validation
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure UUID extensions are enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tenant Office Geofence & Network IP configuration
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS office_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS office_longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS geofence_radius_meters INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS office_allowed_ips JSONB DEFAULT '[]'::jsonb;

-- 2. Employee attendance link token persistence
ALTER TABLE hr_employees
ADD COLUMN IF NOT EXISTS attendance_token TEXT;

-- 3. Employee Attendance Logs Table
CREATE TABLE IF NOT EXISTS hr_attendance_records (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    marked_at               TIMESTAMPTZ DEFAULT NOW(),
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,
    distance_meters         DOUBLE PRECISION,
    ip_address              TEXT NOT NULL,
    status                  TEXT DEFAULT 'present' CHECK (status IN ('present', 'rejected', 'flagged')),
    rejection_reason        TEXT,
    verification_details    JSONB DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_hr_attendance_tenant ON hr_attendance_records(tenant_id, marked_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_employee ON hr_attendance_records(employee_id, marked_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_status ON hr_attendance_records(tenant_id, status);

-- 5. Enable Row Level Security & Tenant Isolation Policy
ALTER TABLE hr_attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_hr_attendance ON hr_attendance_records;
CREATE POLICY tenant_isolation_hr_attendance ON hr_attendance_records
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
