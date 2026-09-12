const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://hassan:zareaai123@localhost:5432/ai_platform';

async function runMigrations() {
  console.log('====================================================');
  console.log('🚀 Running Enterprise AI Database Migrations One by One');
  console.log('====================================================');
  console.log(`Connecting to: ${connectionString.replace(/:[^:@]+@/, ':****@')}\n`);

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // 1. Create schema_migrations table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'success'
      );
    `);

    // 2. Discover migration files
    const migDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration scripts in database/migrations/\n`);

    let appliedCount = 0;
    let verifiedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(migDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const step = `[${String(i + 1).padStart(2, '0')}/${files.length}]`;

      process.stdout.write(`${step} Running ${file} ... `);

      // Check if already recorded in schema_migrations
      const rec = await client.query('SELECT name FROM schema_migrations WHERE name = $1', [file]);

      try {
        await client.query(sql);

        if (rec.rows.length === 0) {
          await client.query(
            'INSERT INTO schema_migrations (name, status) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING;',
            [file, 'applied']
          );
          appliedCount++;
          console.log('✅ APPLIED');
        } else {
          verifiedCount++;
          console.log('✅ VERIFIED');
        }
      } catch (err) {
        await client.query('ROLLBACK;').catch(() => {});

        const isAlreadyExists =
          err.code === '42710' || // duplicate_object
          err.code === '42P07' || // duplicate_table
          err.code === '42701' || // duplicate_column
          err.code === '23505' || // unique_violation
          (err.message && err.message.toLowerCase().includes('already exists'));

        if (isAlreadyExists) {
          await client.query(
            'INSERT INTO schema_migrations (name, status) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET status = EXCLUDED.status;',
            [file, 'verified_existing']
          );
          verifiedCount++;
          console.log(`✅ VERIFIED (${err.message.split('\n')[0].trim()})`);
        } else {
          console.error(`\n❌ ERROR in ${file}:`, err.message);
          throw err;
        }
      }
    }

    console.log('\n====================================================');
    console.log(`🎉 Migrations complete! Applied: ${appliedCount}, Verified: ${verifiedCount}, Total: ${files.length}`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ Migration run failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
