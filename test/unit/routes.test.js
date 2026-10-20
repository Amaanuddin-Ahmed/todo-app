// API Routes Unit Tests
// Uses supertest against createApp with fake repository.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/create-app.js';
import { createFakeTasksRepository } from './fake-repository.js';

describe('API Routes', () => {
  let fakeRepo;
  let app;

  beforeEach(() => {
    fakeRepo = createFakeTasksRepository();
    app = createApp({ tasksRepository: fakeRepo });
  });

  describe('GET /api/health', () => {
    it('returns 200 with detailed health info', async () => {
      await request(app)
        .get('/api/health')
        .expect(200)
        .expect(res => {
          assert.equal(res.body.status, 'healthy');
          assert.equal(res.body.tiers.browser, 'Connected');
          assert.equal(res.body.tiers.express, 'Online');
          assert.equal(res.body.tiers.postgres, 'Connected');
          assert.ok(typeof res.body.dbLatencyMs === 'number');
          assert.equal(res.body.totalTasks, 0);
          assert.ok(res.body.timestamp);
        });
    });
  });

  describe('GET /api/todos', () => {
    it('returns empty array initially', async () => {
      await request(app).get('/api/todos').expect(200).expect({ tasks: [] });
    });

    it('returns tasks with all fields', async () => {
      await request(app).post('/api/todos').send({ title: 'First' }).expect(201);
      await request(app).post('/api/todos').send({ title: 'Second' }).expect(201);
      await request(app).post('/api/todos').send({ title: 'Third' }).expect(201);

      const res = await request(app).get('/api/todos').expect(200);
      assert.equal(res.body.tasks.length, 3);
      assert.equal(res.body.tasks[0].title, 'Third');
      assert.equal(res.body.tasks[1].title, 'Second');
      assert.equal(res.body.tasks[2].title, 'First');
      // Check all fields present
      const task = res.body.tasks[0];
      assert.ok(task.id);
      assert.ok(task.description !== undefined);
      assert.ok(task.priority);
      assert.ok(task.category);
      assert.ok(task.dueAt !== undefined);
      assert.ok(task.reminderAt !== undefined);
      assert.ok(task.reminderSent !== undefined);
      assert.ok(task.estimatedMinutes !== undefined);
      assert.ok(task.actualSecondsSpent !== undefined);
      assert.ok(task.subtasks !== undefined);
      assert.ok(task.pinned !== undefined);
      assert.ok(task.createdAt);
      assert.ok(task.updatedAt);
      assert.ok(task.completedAt !== undefined);
    });

    it('supports search query', async () => {
      await request(app).post('/api/todos').send({ title: 'Buy milk' }).expect(201);
      await request(app).post('/api/todos').send({ title: 'Buy bread' }).expect(201);
      await request(app).post('/api/todos').send({ title: 'Walk dog' }).expect(201);

      const res = await request(app).get('/api/todos?search=milk').expect(200);
      assert.equal(res.body.tasks.length, 1);
      assert.equal(res.body.tasks[0].title, 'Buy milk');
    });

    it('supports status filter', async () => {
      await request(app).post('/api/todos').send({ title: 'Active task' }).expect(201);
      const done = await request(app).post('/api/todos').send({ title: 'Done task' }).expect(201);
      await request(app)
        .patch(`/api/todos/${done.body.task.id}`)
        .send({ completed: true })
        .expect(200);

      let res = await request(app).get('/api/todos?status=active').expect(200);
      assert.equal(res.body.tasks.length, 1);
      assert.equal(res.body.tasks[0].title, 'Active task');

      res = await request(app).get('/api/todos?status=completed').expect(200);
      assert.equal(res.body.tasks.length, 1);
      assert.equal(res.body.tasks[0].title, 'Done task');
    });

    it('supports priority filter', async () => {
      await request(app).post('/api/todos').send({ title: 'Low', priority: 'low' }).expect(201);
      await request(app).post('/api/todos').send({ title: 'High', priority: 'high' }).expect(201);
      await request(app)
        .post('/api/todos')
        .send({ title: 'Urgent', priority: 'urgent' })
        .expect(201);

      const res = await request(app).get('/api/todos?priority=high').expect(200);
      assert.equal(res.body.tasks.length, 1);
      assert.equal(res.body.tasks[0].priority, 'high');
    });

    it('supports category filter', async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: 'Work', category: 'Academic' })
        .expect(201);
      await request(app)
        .post('/api/todos')
        .send({ title: 'Personal', category: 'Personal' })
        .expect(201);

      const res = await request(app).get('/api/todos?category=Academic').expect(200);
      assert.equal(res.body.tasks.length, 1);
      assert.equal(res.body.tasks[0].category, 'Academic');
    });

    it('supports sort parameter', async () => {
      await request(app).post('/api/todos').send({ title: 'A', priority: 'low' }).expect(201);
      await request(app).post('/api/todos').send({ title: 'B', priority: 'high' }).expect(201);
      await request(app).post('/api/todos').send({ title: 'C', priority: 'medium' }).expect(201);

      const res = await request(app).get('/api/todos?sort=smartPriority').expect(200);
      // Smart priority: urgent > high > medium > low
      assert.equal(res.body.tasks[0].priority, 'high');
      assert.equal(res.body.tasks[1].priority, 'medium');
      assert.equal(res.body.tasks[2].priority, 'low');
    });
  });

  describe('POST /api/todos', () => {
    it('creates task with valid title', async () => {
      const res = await request(app).post('/api/todos').send({ title: 'Buy milk' }).expect(201);

      assert.ok(res.body.task.id);
      assert.equal(res.body.task.title, 'Buy milk');
      assert.equal(res.body.task.completed, false);
      assert.equal(res.body.task.priority, 'medium');
      assert.equal(res.body.task.category, 'General');
      assert.equal(res.body.task.estimatedMinutes, 25);
      assert.deepEqual(res.body.task.subtasks, []);
      assert.equal(res.body.task.pinned, false);
      assert.ok(res.body.task.createdAt);
      assert.ok(res.body.task.updatedAt);
      assert.equal(res.body.task.completedAt, null);
    });

    it('creates task with all fields', async () => {
      const res = await request(app)
        .post('/api/todos')
        .send({
          title: 'Full task',
          description: 'Description here',
          priority: 'high',
          category: 'Academic',
          dueAt: '2026-12-31T23:59:00.000Z',
          reminderAt: '2026-12-31T22:00:00.000Z',
          estimatedMinutes: 60,
          subtasks: [{ title: 'Step 1', completed: false }],
          pinned: true,
        })
        .expect(201);

      assert.equal(res.body.task.title, 'Full task');
      assert.equal(res.body.task.description, 'Description here');
      assert.equal(res.body.task.priority, 'high');
      assert.equal(res.body.task.category, 'Academic');
      assert.equal(res.body.task.estimatedMinutes, 60);
      assert.equal(res.body.task.subtasks.length, 1);
      assert.equal(res.body.task.pinned, true);
    });

    it('trims whitespace', async () => {
      const res = await request(app).post('/api/todos').send({ title: '  Trimmed  ' }).expect(201);
      assert.equal(res.body.task.title, 'Trimmed');
    });

    it('returns 400 for empty title', async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: '' })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
          assert.equal(res.body.error.field, 'title');
        });
    });

    it('returns 400 for whitespace only', async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: '   ' })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for title > 500 chars', async () => {
      const longTitle = 'a'.repeat(501);
      await request(app)
        .post('/api/todos')
        .send({ title: longTitle })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for non-string title', async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: 123 })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for missing title', async () => {
      await request(app)
        .post('/api/todos')
        .send({})
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for invalid priority', async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: 'Test', priority: 'invalid' })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for invalid estimatedMinutes', async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: 'Test', estimatedMinutes: 0 })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for malformed JSON', async () => {
      await request(app)
        .post('/api/todos')
        .set('Content-Type', 'application/json')
        .send('{ invalid json')
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'MALFORMED_JSON');
        });
    });

    it('returns 415 for non-JSON content type', async () => {
      await request(app)
        .post('/api/todos')
        .set('Content-Type', 'text/plain')
        .send('title=test')
        .expect(415)
        .expect(res => {
          assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
        });
    });

    it('stores XSS payload verbatim', async () => {
      const xss = '<script>alert("xss")</script>';
      const res = await request(app).post('/api/todos').send({ title: xss }).expect(201);
      assert.equal(res.body.task.title, xss);
    });
  });

  describe('GET /api/todos/:id', () => {
    let taskId;

    beforeEach(async () => {
      const res = await request(app).post('/api/todos').send({ title: 'Test' }).expect(201);
      taskId = res.body.task.id;
    });

    it('returns task by ID', async () => {
      const res = await request(app).get(`/api/todos/${taskId}`).expect(200);
      assert.equal(res.body.task.id, taskId);
      assert.equal(res.body.task.title, 'Test');
    });

    it('returns 404 for unknown UUID', async () => {
      await request(app)
        .get('/api/todos/00000000-0000-4000-8000-000000000000')
        .expect(404)
        .expect(res => {
          assert.equal(res.body.error.code, 'NOT_FOUND');
        });
    });

    it('returns 400 for invalid UUID format', async () => {
      await request(app)
        .get('/api/todos/not-a-uuid')
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'INVALID_ID');
        });
    });
  });

  describe('PUT /api/todos/:id', () => {
    let taskId;

    beforeEach(async () => {
      const res = await request(app).post('/api/todos').send({ title: 'Test' }).expect(201);
      taskId = res.body.task.id;
    });

    it('replaces task completely', async () => {
      const res = await request(app)
        .put(`/api/todos/${taskId}`)
        .send({
          title: 'Replaced',
          description: 'New description',
          priority: 'urgent',
          category: 'Exam',
          completed: true,
        })
        .expect(200);

      assert.equal(res.body.task.title, 'Replaced');
      assert.equal(res.body.task.description, 'New description');
      assert.equal(res.body.task.priority, 'urgent');
      assert.equal(res.body.task.category, 'Exam');
      assert.equal(res.body.task.completed, true);
    });
  });

  describe('PATCH /api/todos/:id', () => {
    let taskId;

    beforeEach(async () => {
      const res = await request(app).post('/api/todos').send({ title: 'Test' }).expect(201);
      taskId = res.body.task.id;
    });

    it('toggles completed', async () => {
      const res = await request(app)
        .patch(`/api/todos/${taskId}`)
        .send({ completed: true })
        .expect(200);
      assert.equal(res.body.task.completed, true);
    });

    it('updates title', async () => {
      const res = await request(app)
        .patch(`/api/todos/${taskId}`)
        .send({ title: 'Updated' })
        .expect(200);
      assert.equal(res.body.task.title, 'Updated');
    });

    it('updates multiple fields', async () => {
      const res = await request(app)
        .patch(`/api/todos/${taskId}`)
        .send({ completed: true, title: 'Updated', priority: 'high' })
        .expect(200);
      assert.equal(res.body.task.completed, true);
      assert.equal(res.body.task.title, 'Updated');
      assert.equal(res.body.task.priority, 'high');
    });

    it('returns 400 for no fields', async () => {
      await request(app)
        .patch(`/api/todos/${taskId}`)
        .send({})
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for non-boolean completed', async () => {
      await request(app)
        .patch(`/api/todos/${taskId}`)
        .send({ completed: 'yes' })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 404 for unknown UUID', async () => {
      await request(app)
        .patch('/api/todos/00000000-0000-4000-8000-000000000000')
        .send({ completed: true })
        .expect(404)
        .expect(res => {
          assert.equal(res.body.error.code, 'NOT_FOUND');
        });
    });

    it('returns 400 for invalid UUID format', async () => {
      await request(app)
        .patch('/api/todos/not-a-uuid')
        .send({ completed: true })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'INVALID_ID');
        });
    });

    it('updates subtasks', async () => {
      const res = await request(app)
        .patch(`/api/todos/${taskId}`)
        .send({
          subtasks: [
            { title: 'Sub 1', completed: true },
            { title: 'Sub 2', completed: false },
          ],
        })
        .expect(200);
      assert.equal(res.body.task.subtasks.length, 2);
      assert.equal(res.body.task.subtasks[0].completed, true);
    });

    it('updates actualSecondsSpent', async () => {
      const res = await request(app)
        .patch(`/api/todos/${taskId}`)
        .send({ actualSecondsSpent: 1800 })
        .expect(200);
      assert.equal(res.body.task.actualSecondsSpent, 1800);
    });
  });

  describe('DELETE /api/todos/:id', () => {
    let taskId;

    beforeEach(async () => {
      const res = await request(app).post('/api/todos').send({ title: 'Test' }).expect(201);
      taskId = res.body.task.id;
    });

    it('deletes task and returns deleted item for undo', async () => {
      const res = await request(app).delete(`/api/todos/${taskId}`).expect(200);
      assert.equal(res.body.deleted, true);
      assert.equal(res.body.id, taskId);
      assert.equal(res.body.item.title, 'Test');

      const getRes = await request(app).get('/api/todos').expect(200);
      assert.equal(getRes.body.tasks.length, 0);
    });

    it('returns 404 for unknown UUID', async () => {
      await request(app)
        .delete('/api/todos/00000000-0000-4000-8000-000000000000')
        .expect(404)
        .expect(res => {
          assert.equal(res.body.error.code, 'NOT_FOUND');
        });
    });

    it('returns 400 for invalid UUID format', async () => {
      await request(app)
        .delete('/api/todos/not-a-uuid')
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'INVALID_ID');
        });
    });
  });

  describe('POST /api/todos/clear-completed', () => {
    it('clears all completed tasks', async () => {
      await request(app).post('/api/todos').send({ title: 'Active 1' }).expect(201);
      const done1 = await request(app).post('/api/todos').send({ title: 'Done 1' }).expect(201);
      const done2 = await request(app).post('/api/todos').send({ title: 'Done 2' }).expect(201);

      await request(app)
        .patch(`/api/todos/${done1.body.task.id}`)
        .send({ completed: true })
        .expect(200);
      await request(app)
        .patch(`/api/todos/${done2.body.task.id}`)
        .send({ completed: true })
        .expect(200);

      const res = await request(app).post('/api/todos/clear-completed').send({}).expect(200);
      assert.equal(res.body.deleted, 2);
      assert.equal(res.body.tasks.length, 2);

      const getRes = await request(app).get('/api/todos').expect(200);
      assert.equal(getRes.body.tasks.length, 1);
      assert.equal(getRes.body.tasks[0].title, 'Active 1');
    });

    it('returns 0 when no completed tasks', async () => {
      await request(app).post('/api/todos').send({ title: 'Active' }).expect(201);
      const res = await request(app).post('/api/todos/clear-completed').send({}).expect(200);
      assert.equal(res.body.deleted, 0);
    });
  });

  describe('Unknown API routes', () => {
    it('returns 404 JSON for unknown /api route', async () => {
      await request(app)
        .get('/api/unknown')
        .expect(404)
        .expect(res => {
          assert.equal(res.body.error.code, 'NOT_FOUND');
        });
    });
  });
});
