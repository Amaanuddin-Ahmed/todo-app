// Tasks Service - Business Logic Layer
// Validates input, orchestrates repository calls.

// import { randomUUID } from "node:crypto"; // reserved for future use

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
  if (trimmed.length > 200) {
    throw new ValidationError('Title must be 200 characters or fewer', 'title');
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
 * Validate patch fields.
 * @param {Object} body
 * @returns {Object} Validated fields
 * @throws {ValidationError}
 */
function validatePatchFields(body) {
  const fields = {};

  if ('completed' in body) {
    if (typeof body.completed !== 'boolean') {
      throw new ValidationError('Completed must be a boolean', 'completed');
    }
    fields.completed = body.completed;
  }

  if ('title' in body) {
    fields.title = validateTitle(body.title);
  }

  return fields;
}

/**
 * Create tasks service with injected repository.
 * @param {Object} tasksRepository - Repository instance
 * @returns {Object} Service methods
 */
export function createTasksService(tasksRepository) {
  /**
   * Get all tasks.
   * @returns {Promise<Array<Object>>}
   */
  async function getAllTasks() {
    return tasksRepository.findAll();
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
   * @param {Object} body - { title }
   * @returns {Promise<Object>} Created task
   * @throws {ValidationError}
   */
  async function createTask(body) {
    const title = validateTitle(body?.title);
    return tasksRepository.create(title);
  }

  /**
   * Update a task.
   * @param {string} id
   * @param {Object} body - { completed?, title? }
   * @returns {Promise<Object>} Updated task
   * @throws {InvalidIdError|NotFoundError|ValidationError}
   */
  async function updateTask(id, body) {
    validateUuid(id);
    const fields = validatePatchFields(body);

    if (Object.keys(fields).length === 0) {
      throw new ValidationError('At least one field (completed or title) is required');
    }

    const task = await tasksRepository.update(id, fields);
    if (!task) {
      throw new NotFoundError();
    }
    return task;
  }

  /**
   * Delete a task.
   * @param {string} id
   * @returns {Promise<void>}
   * @throws {InvalidIdError|NotFoundError}
   */
  async function deleteTask(id) {
    validateUuid(id);
    const deleted = await tasksRepository.deleteById(id);
    if (!deleted) {
      throw new NotFoundError();
    }
  }

  /**
   * Check database health.
   * @returns {Promise<boolean>}
   */
  async function checkHealth() {
    return tasksRepository.checkHealth();
  }

  return {
    getAllTasks,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
    checkHealth,
  };
}
