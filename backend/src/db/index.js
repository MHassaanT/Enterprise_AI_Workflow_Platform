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
    client.query('ALTER TABLE hr_projects ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;')
      .then(() => console.log('✅ hr_projects last_reminder_sent_at column verified'))
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
