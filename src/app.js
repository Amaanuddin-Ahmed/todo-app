// Vercel Entry Point
// Default-exported Express app for zero-config Vercel detection.
// Wires real pg repository with connection pooling.

import pg from 'pg';
import { createApp } from './create-app.js';
import { createTasksRepository } from './repositories/tasks-repository.js';

const { Pool } = pg;

// Create pg Pool with connection limits suitable for serverless
function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Don't throw here - let the health endpoint return 503
    console.warn('⚠️  DATABASE_URL not set - database operations will fail');
    return null;
  }

  // Reuse existing pool instance across warm serverless invocations
  if (globalThis.__pgPool) {
    return globalThis.__pgPool;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  const pool = new Pool({
    connectionString,
    max: isProduction ? 10 : 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  globalThis.__pgPool = pool;
  return pool;
}

// Create pool and repository at module level (runs on cold start)
const pool = createPool();
const tasksRepository = pool ? createTasksRepository(pool) : null;

// Create and export the Express app
const app = createApp({
  tasksRepository,
  pool,
});

export default app;

// Graceful shutdown for local development
if (process.env.NODE_ENV !== 'production') {
  process.on('SIGINT', async () => {
    console.log('\n🛑  Shutting down...');
    if (pool) {
      await pool.end();
    }
    process.exit(0);
  });
}
