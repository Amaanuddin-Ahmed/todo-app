// Database Migration Runner
// Idempotent, transactional, clear output, non-zero exit on failure
// Uses DATABASE_URL_UNPOOLED (unpooled connection for DDL)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌  Missing DATABASE_URL_UNPOOLED or DATABASE_URL environment variable');
    console.error('   Set it in .env.local or ensure Vercel Neon integration is linked.');
    process.exit(1);
  }

  // Use a single connection for migration (not pooled)
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();

  try {
    console.log('🔄  Running database migration...');

    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');

    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');

    console.log('✅  Migration completed successfully');
    console.log("   Table 'tasks' created (if not exists)");
    console.log("   Index 'idx_tasks_created_at_desc' created (if not exists)");
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌  Migration failed:');
    console.error(err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
