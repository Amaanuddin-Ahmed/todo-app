// Tasks Service - Business Logic Layer
// Validates input, orchestrates repository calls.

import { randomUUID } from 'node:crypto';

/**
 * Validation error class for consistent error handling.
 */
export class ValidationError extends Error {
  constructor(message, field = 'title') {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.field = field;
    this.statusCode = 400;
  }
}

/**
 * Not found error class.
 */
export class NotFoundError extends Error {
  constructor(message = 'Task not found') {
    super(message);
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
    this.statusCode = 404;
  }
}

/**
 * Invalid UUID error class.
 */
export class InvalidIdError extends Error {
  constructor(message = 'Invalid task ID') {
    super(message);
    this.name = 'InvalidIdError';
    this.code = 'INVALID_ID';
    this.statusCode = 400;
  }
}

const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_SORTS = ['smartPriority', 'dueDate', 'createdDate', 'effort', 'timeSpent'];

/**
 * Validate and sanitize task title.
 * @param {unknown} title - Raw input
 * @returns {string} Trimmed title
 * @throws {ValidationError}
 */
function validateTitle(title) {
  if (typeof title !== 'string') {
    throw new ValidationError('Title must be a string', 'title');
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Title cannot be empty or whitespace only', 'title');
  }
  if (trimmed.length > 500) {
    throw new ValidationError('Title must be 500 characters or fewer', 'title');
  }
  return trimmed;
}

/**
 * Validate UUID format.
 * @param {string} id
 * @throws {InvalidIdError}
 */
function validateUuid(id) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new InvalidIdError();
  }
}

/**
 * Validate priority.
 * @param {unknown} priority
 * @returns {string}
 * @throws {ValidationError}
 */
function validatePriority(priority) {
  if (priority !== undefined && priority !== null && !VALID_PRIORITIES.includes(priority)) {
    throw new ValidationError(
      `Priority must be one of: ${VALID_PRIORITIES.join(', ')}`,
      'priority'
    );
  }
  return priority || 'medium';
}

/**
 * Validate category.
 * @param {unknown} category
 * @returns {string}
 * @throws {ValidationError}
 */
function validateCategory(category) {
  if (category !== undefined && category !== null && typeof category !== 'string') {
    throw new ValidationError('Category must be a string', 'category');
  }
  return category || 'General';
}

/**
 * Validate due_at timestamp.
 * @param {unknown} dueAt
 * @returns {string|null}
 * @throws {ValidationError}
 */
function validateDueAt(dueAt) {
  if (dueAt === undefined || dueAt === null || dueAt === '') return null;
  const date = new Date(dueAt);
  if (isNaN(date.getTime())) {
    throw new ValidationError('Invalid due date format', 'dueAt');
  }
  return date.toISOString();
}

/**
 * Validate reminder_at timestamp.
 * @param {unknown} reminderAt
 * @returns {string|null}
 * @throws {ValidationError}
 */
function validateReminderAt(reminderAt) {
  if (reminderAt === undefined || reminderAt === null || reminderAt === '') return null;
  const date = new Date(reminderAt);
  if (isNaN(date.getTime())) {
    throw new ValidationError('Invalid reminder date format', 'reminderAt');
  }
  return date.toISOString();
}

/**
 * Validate estimated minutes.
 * @param {unknown} estimatedMinutes
 * @returns {number}
 * @throws {ValidationError}
 */
function validateEstimatedMinutes(estimatedMinutes) {
  if (estimatedMinutes === undefined || estimatedMinutes === null) return 25;
  const num = Number(estimatedMinutes);
  if (!Number.isInteger(num) || num < 1 || num > 1440) {
    throw new ValidationError(
      'Estimated minutes must be an integer between 1 and 1440',
      'estimatedMinutes'
    );
  }
  return num;
}

/**
 * Validate actual seconds spent.
 * @param {unknown} actualSecondsSpent
 * @returns {number}
 * @throws {ValidationError}
 */
function validateActualSecondsSpent(actualSecondsSpent) {
  if (actualSecondsSpent === undefined || actualSecondsSpent === null) return 0;
  const num = Number(actualSecondsSpent);
  if (!Number.isInteger(num) || num < 0) {
    throw new ValidationError(
      'Actual seconds spent must be a non-negative integer',
      'actualSecondsSpent'
    );
  }
  return num;
}

/**
 * Validate subtasks array.
 * @param {unknown} subtasks
 * @returns {Array<Object>}
 * @throws {ValidationError}
 */
function validateSubtasks(subtasks) {
  if (subtasks === undefined || subtasks === null) return [];
  if (!Array.isArray(subtasks)) {
    throw new ValidationError('Subtasks must be an array', 'subtasks');
  }
  return subtasks.map((st, i) => {
    if (!st || typeof st !== 'object') {
      throw new ValidationError(`Subtask ${i} must be an object`, 'subtasks');
    }
    return {
      id: st.id || randomUUID(),
      title: String(st.title || '').trim(),
      completed: Boolean(st.completed),
    };
  });
}

/**
 * Validate pinned.
 * @param {unknown} pinned
 * @returns {boolean}
 */
function validatePinned(pinned) {
  return Boolean(pinned);
}

/**
 * Validate create task body.
 * @param {Object} body
 * @returns {Object} Validated fields
 * @throws {ValidationError}
 */
function validateCreateBody(body) {
  const title = validateTitle(body?.title);

  return {
    title,
    description: typeof body?.description === 'string' ? body.description.trim() : '',
    completed: Boolean(body?.completed),
    priority: validatePriority(body?.priority),
    category: validateCategory(body?.category),
    dueAt: validateDueAt(body?.dueAt ?? body?.due_at),
    reminderAt: validateReminderAt(body?.reminderAt ?? body?.reminder_at),
    estimatedMinutes: validateEstimatedMinutes(body?.estimatedMinutes ?? body?.estimated_minutes),
    subtasks: validateSubtasks(body?.subtasks),
    pinned: validatePinned(body?.pinned),
  };
}

/**
 * Validate update task body.
 * @param {Object} body
 * @returns {Object} Validated fields
 * @throws {ValidationError}
 */
function validateUpdateBody(body) {
  const fields = {};

  if ('title' in body) {
    fields.title = validateTitle(body.title);
  }
  if ('description' in body) {
    fields.description = typeof body.description === 'string' ? body.description.trim() : '';
  }
  if ('completed' in body) {
    if (typeof body.completed !== 'boolean') {
      throw new ValidationError('Completed must be a boolean', 'completed');
    }
    fields.completed = body.completed;
  }
  if ('priority' in body) {
    fields.priority = validatePriority(body.priority);
  }
  if ('category' in body) {
    fields.category = validateCategory(body.category);
  }
  if ('dueAt' in body || 'due_at' in body) {
    fields.dueAt = validateDueAt(body.dueAt ?? body.due_at);
  }
  if ('reminderAt' in body || 'reminder_at' in body) {
    fields.reminderAt = validateReminderAt(body.reminderAt ?? body.reminder_at);
  }
  if ('reminderSent' in body || 'reminder_sent' in body) {
    const val = body.reminderSent ?? body.reminder_sent;
    if (typeof val !== 'boolean') {
      throw new ValidationError('Reminder sent must be a boolean', 'reminderSent');
    }
    fields.reminderSent = val;
  }
  if ('estimatedMinutes' in body || 'estimated_minutes' in body) {
    fields.estimatedMinutes = validateEstimatedMinutes(
      body.estimatedMinutes ?? body.estimated_minutes
    );
  }
  if ('actualSecondsSpent' in body || 'actual_seconds_spent' in body) {
    fields.actualSecondsSpent = validateActualSecondsSpent(
      body.actualSecondsSpent ?? body.actual_seconds_spent
    );
  }
  if ('subtasks' in body) {
    fields.subtasks = validateSubtasks(body.subtasks);
  }
  if ('pinned' in body) {
    fields.pinned = validatePinned(body.pinned);
  }

  return fields;
}

/**
 * Validate query parameters for GET /api/todos.
 * @param {Object} query
 * @returns {Object} Validated query
 */
function validateQuery(query) {
  return {
    search: typeof query.search === 'string' ? query.search.trim() : undefined,
    status: ['all', 'active', 'completed', 'today', 'overdue'].includes(query.status)
      ? query.status
      : 'all',
    priority: VALID_PRIORITIES.includes(query.priority) ? query.priority : undefined,
    category: typeof query.category === 'string' ? query.category.trim() : undefined,
    sort: VALID_SORTS.includes(query.sort) ? query.sort : 'smartPriority',
  };
}

/**
 * Create tasks service with injected repository.
 * @param {Object} tasksRepository - Repository instance
 * @returns {Object} Service methods
 */
export function createTasksService(tasksRepository) {
  /**
   * Get all tasks with filtering and sorting.
   * @param {Object} query - Query parameters
   * @returns {Promise<Array<Object>>}
   */
  async function getAllTasks(query = {}) {
    const validatedQuery = validateQuery(query);
    return tasksRepository.findAll(validatedQuery);
  }

  /**
   * Get task by ID.
   * @param {string} id
   * @returns {Promise<Object>}
   * @throws {InvalidIdError|NotFoundError}
   */
  async function getTaskById(id) {
    validateUuid(id);
    const task = await tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundError();
    }
    return task;
  }

  /**
   * Create a new task.
   * @param {Object} body
   * @returns {Promise<Object>} Created task
   * @throws {ValidationError}
   */
  async function createTask(body) {
    const taskData = validateCreateBody(body);
    return tasksRepository.create(taskData);
  }

  /**
   * Update a task (PATCH - partial).
   * @param {string} id
   * @param {Object} body
   * @returns {Promise<Object>} Updated task
   * @throws {InvalidIdError|NotFoundError|ValidationError}
   */
  async function updateTask(id, body) {
    validateUuid(id);
    const fields = validateUpdateBody(body);

    if (Object.keys(fields).length === 0) {
      throw new ValidationError('At least one field is required');
    }

    const task = await tasksRepository.update(id, fields);
    if (!task) {
      throw new NotFoundError();
    }
    return task;
  }

  /**
   * Full update a task (PUT - full replacement).
   * @param {string} id
   * @param {Object} body
   * @returns {Promise<Object>} Updated task
   * @throws {InvalidIdError|NotFoundError|ValidationError}
   */
  async function replaceTask(id, body) {
    validateUuid(id);
    const taskData = validateCreateBody(body);

    const task = await tasksRepository.update(id, taskData);
    if (!task) {
      throw new NotFoundError();
    }
    return task;
  }

  /**
   * Delete a task.
   * @param {string} id
   * @returns {Promise<Object>} Deleted task for undo
   * @throws {InvalidIdError|NotFoundError}
   */
  async function deleteTask(id) {
    validateUuid(id);
    const task = await tasksRepository.deleteById(id);
    if (!task) {
      throw new NotFoundError();
    }
    return task;
  }

  /**
   * Clear all completed tasks.
   * @returns {Promise<Object>} Deleted count and tasks
   */
  async function clearCompleted() {
    const deletedTasks = await tasksRepository.clearCompleted();
    return { deleted: deletedTasks.length, tasks: deletedTasks };
  }

  /**
   * Get tasks needing reminder.
   * @returns {Promise<Array<Object>>}
   */
  async function getTasksNeedingReminder() {
    return tasksRepository.getTasksNeedingReminder();
  }

  /**
   * Mark reminder as sent.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function markReminderSent(id) {
    validateUuid(id);
    return tasksRepository.markReminderSent(id);
  }

  /**
   * Get database stats for health check.
   * @returns {Promise<Object>}
   */
  async function getStats() {
    return tasksRepository.getStats();
  }

  /**
   * Check database health with latency.
   * @returns {Promise<{healthy: boolean, latencyMs: number}>}
   */
  async function checkHealth() {
    return tasksRepository.checkHealth();
  }

  return {
    getAllTasks,
    getTaskById,
    createTask,
    updateTask,
    replaceTask,
    deleteTask,
    clearCompleted,
    getTasksNeedingReminder,
    markReminderSent,
    getStats,
    checkHealth,
  };
}
