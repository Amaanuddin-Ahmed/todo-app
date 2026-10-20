// In-Memory Fake Tasks Repository for Unit Tests
// Implements the same interface as the real pg repository.

/**
 * Create a fake tasks repository backed by a Map.
 * @returns {Object} Repository methods
 */
export function createFakeTasksRepository() {
  const tasks = new Map();

  function generateId() {
    // Generate a valid UUID v4 format for testing
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function now() {
    return new Date().toISOString();
  }

  function mapRow(task) {
    return {
      id: task.id,
      title: task.title,
      completed: task.completed,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  return {
    async findAll() {
      return Array.from(tasks.values())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(mapRow);
    },

    async findById(id) {
      const task = tasks.get(id);
      return task ? mapRow(task) : null;
    },

    async create(title) {
      const id = generateId();
      const timestamp = now();
      const task = {
        id,
        title,
        completed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      tasks.set(id, task);
      return mapRow(task);
    },

    async update(id, fields) {
      const task = tasks.get(id);
      if (!task) return null;

      if (typeof fields.completed === 'boolean') {
        task.completed = fields.completed;
      }
      if (typeof fields.title === 'string') {
        task.title = fields.title;
      }
      task.updatedAt = now();
      return mapRow(task);
    },

    async deleteById(id) {
      return tasks.delete(id);
    },

    async checkHealth() {
      return true;
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
