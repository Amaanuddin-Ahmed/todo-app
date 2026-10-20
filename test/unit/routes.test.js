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
    it('returns 200 with status ok', async () => {
      await request(app).get('/api/health').expect(200).expect({ status: 'ok' });
    });
  });

  describe('GET /api/tasks', () => {
    it('returns empty array initially', async () => {
      await request(app).get('/api/tasks').expect(200).expect({ tasks: [] });
    });

    it('returns tasks newest first', async () => {
      await request(app).post('/api/tasks').send({ title: 'First' }).expect(201);
      await request(app).post('/api/tasks').send({ title: 'Second' }).expect(201);
      await request(app).post('/api/tasks').send({ title: 'Third' }).expect(201);

      const res = await request(app).get('/api/tasks').expect(200);
      assert.equal(res.body.tasks.length, 3);
      assert.equal(res.body.tasks[0].title, 'Third');
      assert.equal(res.body.tasks[1].title, 'Second');
      assert.equal(res.body.tasks[2].title, 'First');
    });
  });

  describe('POST /api/tasks', () => {
    it('creates task with valid title', async () => {
      const res = await request(app).post('/api/tasks').send({ title: 'Buy milk' }).expect(201);

      assert.ok(res.body.task.id);
      assert.equal(res.body.task.title, 'Buy milk');
      assert.equal(res.body.task.completed, false);
      assert.ok(res.body.task.createdAt);
      assert.ok(res.body.task.updatedAt);
    });

    it('trims whitespace', async () => {
      const res = await request(app).post('/api/tasks').send({ title: '  Trimmed  ' }).expect(201);
      assert.equal(res.body.task.title, 'Trimmed');
    });

    it('returns 400 for empty title', async () => {
      await request(app)
        .post('/api/tasks')
        .send({ title: '' })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
          assert.equal(res.body.error.field, 'title');
        });
    });

    it('returns 400 for whitespace only', async () => {
      await request(app)
        .post('/api/tasks')
        .send({ title: '   ' })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for title > 200 chars', async () => {
      const longTitle = 'a'.repeat(201);
      await request(app)
        .post('/api/tasks')
        .send({ title: longTitle })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for non-string title', async () => {
      await request(app)
        .post('/api/tasks')
        .send({ title: 123 })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for missing title', async () => {
      await request(app)
        .post('/api/tasks')
        .send({})
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for malformed JSON', async () => {
      await request(app)
        .post('/api/tasks')
        .set('Content-Type', 'application/json')
        .send('{ invalid json')
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'MALFORMED_JSON');
        });
    });

    it('returns 415 for non-JSON content type', async () => {
      await request(app)
        .post('/api/tasks')
        .set('Content-Type', 'text/plain')
        .send('title=test')
        .expect(415)
        .expect(res => {
          assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
        });
    });

    it('stores XSS payload verbatim', async () => {
      const xss = '<script>alert("xss")</script>';
      const res = await request(app).post('/api/tasks').send({ title: xss }).expect(201);
      assert.equal(res.body.task.title, xss);
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    let taskId;

    beforeEach(async () => {
      const res = await request(app).post('/api/tasks').send({ title: 'Test' }).expect(201);
      taskId = res.body.task.id;
    });

    it('toggles completed', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({ completed: true })
        .expect(200);
      assert.equal(res.body.task.completed, true);
    });

    it('updates title', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({ title: 'Updated' })
        .expect(200);
      assert.equal(res.body.task.title, 'Updated');
    });

    it('updates both fields', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({ completed: true, title: 'Updated' })
        .expect(200);
      assert.equal(res.body.task.completed, true);
      assert.equal(res.body.task.title, 'Updated');
    });

    it('returns 400 for no fields', async () => {
      await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({})
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 400 for non-boolean completed', async () => {
      await request(app)
        .patch(`/api/tasks/${taskId}`)
        .send({ completed: 'yes' })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        });
    });

    it('returns 404 for unknown UUID', async () => {
      await request(app)
        .patch('/api/tasks/00000000-0000-4000-8000-000000000000')
        .send({ completed: true })
        .expect(404)
        .expect(res => {
          assert.equal(res.body.error.code, 'NOT_FOUND');
        });
    });

    it('returns 400 for invalid UUID format', async () => {
      await request(app)
        .patch('/api/tasks/not-a-uuid')
        .send({ completed: true })
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'INVALID_ID');
        });
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    let taskId;

    beforeEach(async () => {
      const res = await request(app).post('/api/tasks').send({ title: 'Test' }).expect(201);
      taskId = res.body.task.id;
    });

    it('deletes task', async () => {
      await request(app).delete(`/api/tasks/${taskId}`).expect(204);
      const res = await request(app).get('/api/tasks').expect(200);
      assert.equal(res.body.tasks.length, 0);
    });

    it('returns 404 for unknown UUID', async () => {
      await request(app)
        .delete('/api/tasks/00000000-0000-4000-8000-000000000000')
        .expect(404)
        .expect(res => {
          assert.equal(res.body.error.code, 'NOT_FOUND');
        });
    });

    it('returns 400 for invalid UUID format', async () => {
      await request(app)
        .delete('/api/tasks/not-a-uuid')
        .expect(400)
        .expect(res => {
          assert.equal(res.body.error.code, 'INVALID_ID');
        });
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
