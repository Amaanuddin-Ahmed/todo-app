// Tasks Service Unit Tests
// Uses fake in-memory repository.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTasksService,
  ValidationError,
  NotFoundError,
  InvalidIdError,
} from '../../src/services/tasks-service.js';
import { createFakeTasksRepository } from './fake-repository.js';

describe('Tasks Service', () => {
  let fakeRepo;
  let service;

  beforeEach(() => {
    fakeRepo = createFakeTasksRepository();
    service = createTasksService(fakeRepo);
  });

  describe('getAllTasks', () => {
    it('returns empty array initially', async () => {
      const tasks = await service.getAllTasks();
      assert.deepEqual(tasks, []);
    });

    it('returns tasks newest first', async () => {
      await service.createTask({ title: 'First' });
      await new Promise(r => setTimeout(r, 10)); // ensure different timestamps
      await service.createTask({ title: 'Second' });
      await new Promise(r => setTimeout(r, 10));
      await service.createTask({ title: 'Third' });

      const tasks = await service.getAllTasks();
      assert.equal(tasks.length, 3);
      assert.equal(tasks[0].title, 'Third');
      assert.equal(tasks[1].title, 'Second');
      assert.equal(tasks[2].title, 'First');
    });
  });

  describe('createTask', () => {
    it('creates a task with valid title', async () => {
      const task = await service.createTask({ title: 'Buy milk' });
      assert.ok(task.id);
      assert.equal(task.title, 'Buy milk');
      assert.equal(task.completed, false);
      assert.ok(task.createdAt);
      assert.ok(task.updatedAt);
    });

    it('trims whitespace from title', async () => {
      const task = await service.createTask({ title: '  Trimmed  ' });
      assert.equal(task.title, 'Trimmed');
    });

    it('rejects empty string', async () => {
      await assert.rejects(
        service.createTask({ title: '' }),
        err => err instanceof ValidationError && err.field === 'title'
      );
    });

    it('rejects whitespace only', async () => {
      await assert.rejects(
        service.createTask({ title: '   ' }),
        err => err instanceof ValidationError && err.field === 'title'
      );
    });

    it('rejects title > 200 chars', async () => {
      const longTitle = 'a'.repeat(201);
      await assert.rejects(
        service.createTask({ title: longTitle }),
        err => err instanceof ValidationError && err.field === 'title'
      );
    });

    it('rejects non-string title', async () => {
      await assert.rejects(
        service.createTask({ title: 123 }),
        err => err instanceof ValidationError && err.field === 'title'
      );
    });

    it('rejects missing title', async () => {
      await assert.rejects(
        service.createTask({}),
        err => err instanceof ValidationError && err.field === 'title'
      );
    });

    it('stores XSS payload as plain text', async () => {
      const xss = '<script>alert("xss")</script>';
      const task = await service.createTask({ title: xss });
      assert.equal(task.title, xss);
    });
  });

  describe('getTaskById', () => {
    it('returns task by ID', async () => {
      const created = await service.createTask({ title: 'Test' });
      const task = await service.getTaskById(created.id);
      assert.deepEqual(task, created);
    });

    it('throws NotFoundError for unknown UUID', async () => {
      await assert.rejects(
        service.getTaskById('00000000-0000-4000-8000-000000000000'),
        err => err instanceof NotFoundError
      );
    });

    it('throws InvalidIdError for malformed UUID', async () => {
      await assert.rejects(service.getTaskById('not-a-uuid'), err => err instanceof InvalidIdError);
    });

    it('throws InvalidIdError for empty string', async () => {
      await assert.rejects(service.getTaskById(''), err => err instanceof InvalidIdError);
    });
  });

  describe('updateTask', () => {
    it('toggles completed', async () => {
      const created = await service.createTask({ title: 'Test' });
      const updated = await service.updateTask(created.id, { completed: true });
      assert.equal(updated.completed, true);
      // updatedAt should be >= createdAt (may be equal if same millisecond)
      assert.ok(new Date(updated.updatedAt) >= new Date(created.updatedAt));
    });

    it('updates title', async () => {
      const created = await service.createTask({ title: 'Old' });
      const updated = await service.updateTask(created.id, { title: 'New' });
      assert.equal(updated.title, 'New');
    });

    it('updates both fields', async () => {
      const created = await service.createTask({ title: 'Old' });
      const updated = await service.updateTask(created.id, { completed: true, title: 'New' });
      assert.equal(updated.completed, true);
      assert.equal(updated.title, 'New');
    });

    it('throws ValidationError if no fields provided', async () => {
      const created = await service.createTask({ title: 'Test' });
      await assert.rejects(
        service.updateTask(created.id, {}),
        err => err instanceof ValidationError
      );
    });

    it('throws ValidationError for non-boolean completed', async () => {
      const created = await service.createTask({ title: 'Test' });
      await assert.rejects(
        service.updateTask(created.id, { completed: 'yes' }),
        err => err instanceof ValidationError && err.field === 'completed'
      );
    });

    it('throws ValidationError for invalid title', async () => {
      const created = await service.createTask({ title: 'Test' });
      await assert.rejects(
        service.updateTask(created.id, { title: '' }),
        err => err instanceof ValidationError && err.field === 'title'
      );
    });

    it('throws NotFoundError for unknown UUID', async () => {
      await assert.rejects(
        service.updateTask('00000000-0000-4000-8000-000000000000', { completed: true }),
        err => err instanceof NotFoundError
      );
    });

    it('throws InvalidIdError for malformed UUID', async () => {
      await assert.rejects(
        service.updateTask('invalid', { completed: true }),
        err => err instanceof InvalidIdError
      );
    });
  });

  describe('deleteTask', () => {
    it('deletes existing task', async () => {
      const created = await service.createTask({ title: 'Test' });
      await service.deleteTask(created.id);
      const tasks = await service.getAllTasks();
      assert.equal(tasks.length, 0);
    });

    it('throws NotFoundError for unknown UUID', async () => {
      await assert.rejects(
        service.deleteTask('00000000-0000-4000-8000-000000000000'),
        err => err instanceof NotFoundError
      );
    });

    it('throws InvalidIdError for malformed UUID', async () => {
      await assert.rejects(service.deleteTask('invalid'), err => err instanceof InvalidIdError);
    });
  });

  describe('checkHealth', () => {
    it('returns true when healthy', async () => {
      const healthy = await service.checkHealth();
      assert.equal(healthy, true);
    });
  });
});
