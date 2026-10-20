// Local Development Server
// Runs Express app on PORT (default 3000) with file watching via `node --watch`.
// Loads .env.local via --env-file flag in package.json script.

import { createApp } from '../src/create-app.js';
import { createTasksRepository } from '../src/repositories/tasks-repository.js';
import pg from 'pg';

const { Pool } = pg;

const PORT = process.env.PORT || 3000;

// Create pg Pool for local development
function createLocalPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn('⚠️  No DATABASE_URL in .env.local - API will return 503');
    return null;
  }

  return new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
}

const pool = createLocalPool();
const tasksRepository = pool ? createTasksRepository(pool) : null;

if (pool) {
  console.log('✅  Database pool connected');
}

// Create and start app
const app = createApp({
  tasksRepository,
  pool,
});

app.listen(PORT, () => {
  console.log(`🚀  Dev server running at http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
