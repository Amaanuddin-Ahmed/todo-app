// Database Integration Test
// Runs ONLY when TEST_DATABASE_URL environment variable is set.
// Tests the real pg repository against a live database.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../../src/create-app.js';
import { createTasksRepository } from '../../src/repositories/tasks-repository.js';

const { Pool } = pg;

describe('Database Integration', () => {
  // Skip entire suite if no TEST_DATABASE_URL
  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl) {
    console.log('⏭  Skipping integration tests (TEST_DATABASE_URL not set)');
    return;
  }

  let pool;
  let app;
  let repo;

  before(async () => {
    pool = new Pool({
      connectionString: testDbUrl,
      max: 3,
      ssl: testDbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    });

    // Ensure clean state
    await pool.query('TRUNCATE tasks');

    repo = createTasksRepository(pool);
    app = createApp({ tasksRepository: repo, pool });
  });

  after(async () => {
    if (pool) {
      await pool.query('TRUNCATE tasks');
      await pool.end();
    }
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE tasks');
  });

  it('health check passes with real DB', async () => {
    await request(app).get('/api/health').expect(200).expect({ status: 'ok' });
  });

  it('creates and retrieves task', async () => {
    const createRes = await request(app)
      .post('/api/tasks')
      .send({ title: 'Integration Test' })
      .expect(201);

    assert.ok(createRes.body.task.id);
    assert.equal(createRes.body.task.title, 'Integration Test');

    const getRes = await request(app).get('/api/tasks').expect(200);
    assert.equal(getRes.body.tasks.length, 1);
    assert.equal(getRes.body.tasks[0].title, 'Integration Test');
  });

  it('persists across requests', async () => {
    await request(app).post('/api/tasks').send({ title: 'Task 1' }).expect(201);
    await request(app).post('/api/tasks').send({ title: 'Task 2' }).expect(201);

    const res = await request(app).get('/api/tasks').expect(200);
    assert.equal(res.body.tasks.length, 2);
  });

  it('toggles completion', async () => {
    const createRes = await request(app).post('/api/tasks').send({ title: 'Toggle' }).expect(201);
    const id = createRes.body.task.id;

    await request(app).patch(`/api/tasks/${id}`).send({ completed: true }).expect(200);

    const getRes = await request(app).get('/api/tasks').expect(200);
    assert.equal(getRes.body.tasks[0].completed, true);
  });

  it('deletes task', async () => {
    const createRes = await request(app)
      .post('/api/tasks')
      .send({ title: 'Delete Me' })
      .expect(201);
    const id = createRes.body.task.id;

    await request(app).delete(`/api/tasks/${id}`).expect(204);

    const getRes = await request(app).get('/api/tasks').expect(200);
    assert.equal(getRes.body.tasks.length, 0);
  });
});
