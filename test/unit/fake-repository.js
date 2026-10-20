// In-Memory Fake Tasks Repository for Unit Tests
// Implements the same interface as the real pg repository.

import { randomUUID } from 'node:crypto';

/**
 * Create a fake tasks repository backed by a Map.
 * @returns {Object} Repository methods
 */
export function createFakeTasksRepository() {
  const tasks = new Map();

  function generateId() {
    return randomUUID();
  }

  function now() {
    return new Date().toISOString();
  }

  function mapRow(task) {
    return {
      id: task.id,
      title: task.title,
      description: task.description ?? '',
      completed: task.completed,
      priority: task.priority ?? 'medium',
      category: task.category ?? 'General',
      dueAt: task.dueAt ?? null,
      reminderAt: task.reminderAt ?? null,
      reminderSent: task.reminderSent ?? false,
      estimatedMinutes: task.estimatedMinutes ?? 25,
      actualSecondsSpent: task.actualSecondsSpent ?? 0,
      subtasks: task.subtasks ?? [],
      pinned: task.pinned ?? false,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt ?? null,
    };
  }

  function applyFilters(tasksArray, options = {}) {
    const { search, status, priority, category, sort } = options;
    let filtered = [...tasksArray];

    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        t =>
          t.title.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term) ||
          t.category.toLowerCase().includes(term) ||
          JSON.stringify(t.subtasks).toLowerCase().includes(term)
      );
    }

    if (status && status !== 'all') {
      switch (status) {
        case 'active':
          filtered = filtered.filter(t => !t.completed);
          break;
        case 'completed':
          filtered = filtered.filter(t => t.completed);
          break;
        case 'today':
          filtered = filtered.filter(
            t => !t.completed && t.dueAt && new Date(t.dueAt) <= new Date(Date.now() + 86400000)
          );
          break;
        case 'overdue':
          filtered = filtered.filter(
            t => !t.completed && t.dueAt && new Date(t.dueAt) < new Date()
          );
          break;
      }
    }

    if (priority) {
      filtered = filtered.filter(t => t.priority === priority);
    }

    if (category) {
      filtered = filtered.filter(t => t.category === category);
    }

    // Sort
    filtered.sort((a, b) => {
      // Pinned first
      if (a.pinned !== b.pinned) return b.pinned ? -1 : 1;
      // Completed last
      if (a.completed !== b.completed) return a.completed ? 1 : -1;

      switch (sort) {
        case 'dueDate':
          if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
          if (a.dueAt) return -1;
          if (b.dueAt) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'createdDate':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'effort':
          return (a.estimatedMinutes || 0) - (b.estimatedMinutes || 0);
        case 'timeSpent':
          return (b.actualSecondsSpent || 0) - (a.actualSecondsSpent || 0);
        case 'smartPriority':
        default: {
          const priorityWeight = { urgent: 1, high: 2, medium: 3, low: 4 };
          const pa = priorityWeight[a.priority] || 3;
          const pb = priorityWeight[b.priority] || 3;
          if (pa !== pb) return pa - pb;
          if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
          if (a.dueAt) return -1;
          if (b.dueAt) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
      }
    });

    return filtered;
  }

  return {
    async findAll(options = {}) {
      const allTasks = Array.from(tasks.values());
      return applyFilters(allTasks, options).map(mapRow);
    },

    async findById(id) {
      const task = tasks.get(id);
      return task ? mapRow(task) : null;
    },

    async create(taskData) {
      const id = generateId();
      const timestamp = now();
      const task = {
        id,
        title: taskData.title,
        description: taskData.description ?? '',
        completed: false,
        priority: taskData.priority ?? 'medium',
        category: taskData.category ?? 'General',
        dueAt: taskData.dueAt ?? null,
        reminderAt: taskData.reminderAt ?? null,
        reminderSent: false,
        estimatedMinutes: taskData.estimatedMinutes ?? 25,
        actualSecondsSpent: 0,
        subtasks: taskData.subtasks ?? [],
        pinned: taskData.pinned ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      };
      tasks.set(id, task);
      return mapRow(task);
    },

    async update(id, fields) {
      const task = tasks.get(id);
      if (!task) return null;

      const columnMap = {
        dueAt: 'dueAt',
        reminderAt: 'reminderAt',
        reminderSent: 'reminderSent',
        estimatedMinutes: 'estimatedMinutes',
        actualSecondsSpent: 'actualSecondsSpent',
      };

      for (const [key, value] of Object.entries(fields)) {
        const prop = columnMap[key] || key;
        if (key === 'subtasks') {
          task.subtasks = value;
        } else {
          task[prop] = value;
        }
      }
      task.updatedAt = now();
      return mapRow(task);
    },

    async deleteById(id) {
      const task = tasks.get(id);
      if (!task) return null;
      tasks.delete(id);
      return mapRow(task);
    },

    async clearCompleted() {
      const deleted = [];
      for (const [id, task] of tasks.entries()) {
        if (task.completed) {
          deleted.push(mapRow(task));
          tasks.delete(id);
        }
      }
      return deleted;
    },

    async getTasksNeedingReminder() {
      const now = new Date();
      const result = [];
      for (const task of tasks.values()) {
        if (
          !task.completed &&
          task.reminderAt &&
          !task.reminderSent &&
          new Date(task.reminderAt) <= now
        ) {
          result.push(mapRow(task));
        }
      }
      return result;
    },

    async markReminderSent(id) {
      const task = tasks.get(id);
      if (task) {
        task.reminderSent = true;
        task.updatedAt = now();
      }
    },

    async getStats() {
      return {
        server_time: new Date().toISOString(),
        db_name: 'test_db',
        total_tasks: tasks.size,
      };
    },

    async checkHealth() {
      return { healthy: true, latencyMs: 1 };
    },

    // Test helpers
    _reset() {
      tasks.clear();
    },
    _seed(data) {
      tasks.clear();
      for (const task of data) {
        tasks.set(task.id, { ...task });
      }
    },
  };
}
