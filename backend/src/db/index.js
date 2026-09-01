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
    ])
      .then(() => console.log('✅ HR & SafePay database columns verified'))
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
