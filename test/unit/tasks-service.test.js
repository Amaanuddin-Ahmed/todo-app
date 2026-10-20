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

    it('returns tasks newest first with all fields', async () => {
      await service.createTask({ title: 'First' });
      await new Promise(r => setTimeout(r, 10));
      await service.createTask({ title: 'Second' });
      await new Promise(r => setTimeout(r, 10));
      await service.createTask({ title: 'Third' });

      const tasks = await service.getAllTasks();
      assert.equal(tasks.length, 3);
      assert.equal(tasks[0].title, 'Third');
      assert.equal(tasks[1].title, 'Second');
      assert.equal(tasks[2].title, 'First');
      // Check all fields present
      const task = tasks[0];
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

    it('supports query filters', async () => {
      await service.createTask({ title: 'Active task', priority: 'low' });
      await service.createTask({ title: 'Done task', priority: 'high' });
      const done = await service.createTask({ title: 'Another done', priority: 'medium' });

      // Mark one as completed via update
      await service.updateTask(done.id, { completed: true });

      let tasks = await service.getAllTasks({ status: 'active' });
      assert.equal(tasks.length, 2);

      tasks = await service.getAllTasks({ status: 'completed' });
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].title, 'Another done');

      tasks = await service.getAllTasks({ priority: 'high' });
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].priority, 'high');

      tasks = await service.getAllTasks({ sort: 'smartPriority' });
      // Should sort by priority weight
      assert.ok(tasks[0].priority === 'high' || tasks[0].priority === 'urgent');
    });
  });

  describe('createTask', () => {
    it('creates a task with valid title', async () => {
      const task = await service.createTask({ title: 'Buy milk' });
      assert.ok(task.id);
      assert.equal(task.title, 'Buy milk');
      assert.equal(task.completed, false);
      assert.equal(task.priority, 'medium');
      assert.equal(task.category, 'General');
      assert.equal(task.estimatedMinutes, 25);
      assert.deepEqual(task.subtasks, []);
      assert.equal(task.pinned, false);
      assert.ok(task.createdAt);
      assert.ok(task.updatedAt);
      assert.equal(task.completedAt, null);
    });

    it('creates task with all optional fields', async () => {
      const task = await service.createTask({
        title: 'Full task',
        description: 'Description here',
        priority: 'high',
        category: 'Academic',
        dueAt: '2026-12-31T23:59:00.000Z',
        reminderAt: '2026-12-31T22:00:00.000Z',
        estimatedMinutes: 60,
        subtasks: [{ title: 'Step 1', completed: false }],
        pinned: true,
      });
      assert.equal(task.title, 'Full task');
      assert.equal(task.description, 'Description here');
      assert.equal(task.priority, 'high');
      assert.equal(task.category, 'Academic');
      assert.equal(task.estimatedMinutes, 60);
      assert.equal(task.subtasks.length, 1);
      assert.equal(task.pinned, true);
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

    it('rejects title > 500 chars', async () => {
      const longTitle = 'a'.repeat(501);
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

    it('rejects invalid priority', async () => {
      await assert.rejects(
        service.createTask({ title: 'Test', priority: 'invalid' }),
        err => err instanceof ValidationError && err.field === 'priority'
      );
    });

    it('rejects invalid estimatedMinutes', async () => {
      await assert.rejects(
        service.createTask({ title: 'Test', estimatedMinutes: 0 }),
        err => err instanceof ValidationError && err.field === 'estimatedMinutes'
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

  describe('updateTask (PATCH)', () => {
    it('toggles completed', async () => {
      const created = await service.createTask({ title: 'Test' });
      const updated = await service.updateTask(created.id, { completed: true });
      assert.equal(updated.completed, true);
      assert.ok(new Date(updated.updatedAt) >= new Date(created.updatedAt));
    });

    it('updates title', async () => {
      const created = await service.createTask({ title: 'Old' });
      const updated = await service.updateTask(created.id, { title: 'New' });
      assert.equal(updated.title, 'New');
    });

    it('updates multiple fields', async () => {
      const created = await service.createTask({ title: 'Old' });
      const updated = await service.updateTask(created.id, { completed: true, title: 'New' });
      assert.equal(updated.completed, true);
      assert.equal(updated.title, 'New');
    });

    it('updates priority and category', async () => {
      const created = await service.createTask({ title: 'Test' });
      const updated = await service.updateTask(created.id, {
        priority: 'urgent',
        category: 'Exam',
      });
      assert.equal(updated.priority, 'urgent');
      assert.equal(updated.category, 'Exam');
    });

    it('updates subtasks', async () => {
      const created = await service.createTask({ title: 'Test' });
      const updated = await service.updateTask(created.id, {
        subtasks: [
          { title: 'Sub 1', completed: true },
          { title: 'Sub 2', completed: false },
        ],
      });
      assert.equal(updated.subtasks.length, 2);
      assert.equal(updated.subtasks[0].completed, true);
    });

    it('updates actualSecondsSpent', async () => {
      const created = await service.createTask({ title: 'Test' });
      const updated = await service.updateTask(created.id, { actualSecondsSpent: 1800 });
      assert.equal(updated.actualSecondsSpent, 1800);
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

    it('throws ValidationError for invalid priority', async () => {
      const created = await service.createTask({ title: 'Test' });
      await assert.rejects(
        service.updateTask(created.id, { priority: 'invalid' }),
        err => err instanceof ValidationError && err.field === 'priority'
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

  describe('replaceTask (PUT)', () => {
    it('replaces task completely', async () => {
      const created = await service.createTask({ title: 'Test', priority: 'low' });
      const replaced = await service.replaceTask(created.id, {
        title: 'Replaced',
        description: 'New desc',
        priority: 'urgent',
        category: 'Exam',
        completed: true,
      });
      assert.equal(replaced.title, 'Replaced');
      assert.equal(replaced.description, 'New desc');
      assert.equal(replaced.priority, 'urgent');
      assert.equal(replaced.category, 'Exam');
      assert.equal(replaced.completed, true);
    });
  });

  describe('deleteTask', () => {
    it('deletes existing task and returns it for undo', async () => {
      const created = await service.createTask({ title: 'Test' });
      const deleted = await service.deleteTask(created.id);
      assert.equal(deleted.id, created.id);
      assert.equal(deleted.title, 'Test');

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

  describe('clearCompleted', () => {
    it('deletes all completed tasks', async () => {
      await service.createTask({ title: 'Active 1' });
      const done1 = await service.createTask({ title: 'Done 1' });
      const done2 = await service.createTask({ title: 'Done 2' });

      await service.updateTask(done1.id, { completed: true });
      await service.updateTask(done2.id, { completed: true });

      const result = await service.clearCompleted();
      assert.equal(result.deleted, 2);
      assert.equal(result.tasks.length, 2);

      const tasks = await service.getAllTasks();
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].title, 'Active 1');
    });
  });

  describe('checkHealth', () => {
    it('returns health status with latency', async () => {
      const health = await service.checkHealth();
      assert.equal(health.healthy, true);
      assert.ok(typeof health.latencyMs === 'number');
    });
  });

  describe('getStats', () => {
    it('returns database stats', async () => {
      await service.createTask({ title: 'Test' });
      const stats = await service.getStats();
      assert.ok(stats.server_time);
      assert.ok(stats.db_name);
      assert.equal(stats.total_tasks, 1);
    });
  });
});
