const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test connection on startup and run light migrations
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ PostgreSQL connected');
    Promise.all([
      client.query('ALTER TABLE hr_projects ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;'),
      client.query('ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS attendance_token TEXT;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS office_latitude DOUBLE PRECISION;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS office_longitude DOUBLE PRECISION;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS geofence_radius_meters INTEGER DEFAULT 200;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS office_allowed_ips JSONB DEFAULT \'[]\'::jsonb;'),
      client.query('ALTER TABLE approval_requests DISABLE ROW LEVEL SECURITY;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_subscription_id VARCHAR(255);'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_customer_id VARCHAR(255);'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS safepay_plan_id VARCHAR(255);'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS safepay_reference VARCHAR(255);'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT \'safepay\';'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;'),
      client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT \'monthly\';'),
      client.query(`CREATE TABLE IF NOT EXISTS webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`),
      client.query(`CREATE TABLE IF NOT EXISTS onboarding_progress (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        step_id VARCHAR(100) NOT NULL,
        completed BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, step_id)
      );`),
      client.query(`CREATE TABLE IF NOT EXISTS appointments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id VARCHAR(255),
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        service_type VARCHAR(255) NOT NULL,
        appointment_date DATE NOT NULL,
        appointment_time VARCHAR(50) NOT NULL,
        duration_minutes INT DEFAULT 60,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'scheduled',
        created_by VARCHAR(50) DEFAULT 'ai_agent',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`),
      client.query('ALTER TABLE reported_issues ADD COLUMN IF NOT EXISTS pr_url VARCHAR(500);'),
      client.query('ALTER TABLE reported_issues ADD COLUMN IF NOT EXISTS pr_number INT;'),
      client.query('ALTER TABLE reported_issues ADD COLUMN IF NOT EXISTS fix_branch VARCHAR(255);'),
      client.query('ALTER TABLE reported_issues ADD COLUMN IF NOT EXISTS fix_summary TEXT;'),
      client.query('ALTER TABLE reported_issues DROP CONSTRAINT IF EXISTS reported_issues_status_check;'),
      client.query('ALTER TABLE reported_issues DROP CONSTRAINT IF EXISTS reported_issues_investigation_status_check;'),
      client.query(`CREATE TABLE IF NOT EXISTS reported_issues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id VARCHAR(255),
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        customer_message TEXT,
        category VARCHAR(100) DEFAULT 'unknown',
        severity VARCHAR(50) DEFAULT 'medium',
        investigation_status VARCHAR(50) DEFAULT 'pending',
        investigation_repo VARCHAR(255),
        investigation_branch VARCHAR(255),
        investigation_findings TEXT,
        investigated_files JSONB DEFAULT '[]'::jsonb,
        root_cause TEXT,
        approval_id UUID REFERENCES approval_requests(id) ON DELETE SET NULL,
        show_in_widget BOOLEAN DEFAULT false,
        status VARCHAR(50) DEFAULT 'open',
        pr_url VARCHAR(500),
        pr_number INT,
        fix_branch VARCHAR(255),
        fix_summary TEXT,
        resolved_at TIMESTAMPTZ,
        resolved_by VARCHAR(255),
        resolution_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`),
      client.query(`CREATE INDEX IF NOT EXISTS idx_reported_issues_tenant_status ON reported_issues(tenant_id, status);`),
      client.query(`CREATE INDEX IF NOT EXISTS idx_reported_issues_created ON reported_issues(tenant_id, created_at DESC);`),
      client.query(`CREATE INDEX IF NOT EXISTS idx_reported_issues_widget ON reported_issues(tenant_id, show_in_widget) WHERE show_in_widget = true;`),
    ])
      .then(() => console.log('✅ HR, SafePay, Onboarding, Appointments & Reported Issues database tables verified'))
      .catch(mErr => console.warn('⚠️ Column migration warning:', mErr.message))
      .finally(() => release());
  }
});

// Helper: run a query with tenant isolation via RLS
const query = async (text, params, tenantId = null) => {
  const client = await pool.connect();
  try {
    if (tenantId) {
      // This is what activates Row Level Security
      await client.query(`SET app.tenant_id = '${tenantId}'`);
    }
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
};

module.exports = { pool, query };
