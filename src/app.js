// Vercel Entry Point
// Default-exported Express app for zero-config Vercel detection.
// Wires real pg repository with connection pooling.

import pg from 'pg';
import { createApp } from './create-app.js';

const { Pool } = pg;

// Create pg Pool with connection limits suitable for serverless
function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Don't throw here - let the health endpoint return 503
    console.warn('⚠️  DATABASE_URL not set - database operations will fail');
    return null;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  return new Pool({
    connectionString,
    max: isProduction ? 10 : 3, // Higher in production, lower locally
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
}

const pool = createPool();

// Create repository if pool exists
let tasksRepository = null;
if (pool) {
  // Import repository factory dynamically to avoid top-level await issues
  import('./repositories/tasks-repository.js').then(({ createTasksRepository }) => {
    tasksRepository = createTasksRepository(pool);
  });
}

// Create and export the Express app
const app = createApp({
  tasksRepository,
  pool, // Pass pool for @vercel/functions attachDatabasePool
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
