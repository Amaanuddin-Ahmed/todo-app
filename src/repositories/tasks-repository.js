// Tasks Repository - Data Access Layer
// Only place where SQL lives. All queries parameterized.

/**
 * Create a tasks repository using the provided pg Pool.
 * @param {import('pg').Pool} pool - Configured pg connection pool
 * @returns {Object} Repository methods
 */
export function createTasksRepository(pool) {
  const SELECT_FIELDS = `
    id, title, description, completed, priority, category,
    due_at AS "dueAt", reminder_at AS "reminderAt", reminder_sent AS "reminderSent",
    estimated_minutes AS "estimatedMinutes", actual_seconds_spent AS "actualSecondsSpent",
    subtasks, pinned,
    created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
  `;

  /**
   * Find all tasks with optional filtering, sorting, and search.
   * @param {Object} options - Filter options
   * @param {string} [options.search] - Search term
   * @param {string} [options.status] - 'all' | 'active' | 'completed' | 'today' | 'overdue'
   * @param {string} [options.priority] - Priority filter
   * @param {string} [options.category] - Category filter
   * @param {string} [options.sort] - Sort field
   * @returns {Promise<Array<Object>>}
   */
  async function findAll(options = {}) {
    const { search, status, priority, category, sort } = options;
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(
        title ILIKE $${paramIndex} OR
        description ILIKE $${paramIndex} OR
        category ILIKE $${paramIndex} OR
        subtasks::text ILIKE $${paramIndex}
      )`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    if (status && status !== 'all') {
      switch (status) {
        case 'active':
          conditions.push('completed = false');
          break;
        case 'completed':
          conditions.push('completed = true');
          break;
        case 'today':
          conditions.push(
            `completed = false AND due_at IS NOT NULL AND due_at <= now() + interval '1 day'`
          );
          break;
        case 'overdue':
          conditions.push(`completed = false AND due_at IS NOT NULL AND due_at < now()`);
          break;
      }
    }

    if (priority) {
      conditions.push(`priority = $${paramIndex}`);
      values.push(priority);
      paramIndex++;
    }

    if (category) {
      conditions.push(`category = $${paramIndex}`);
      values.push(category);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderClause = 'ORDER BY pinned DESC, completed ASC, ';
    switch (sort) {
      case 'dueDate':
        orderClause += 'due_at ASC NULLS LAST, created_at DESC';
        break;
      case 'createdDate':
        orderClause += 'created_at DESC';
        break;
      case 'effort':
        orderClause += 'estimated_minutes ASC, created_at DESC';
        break;
      case 'timeSpent':
        orderClause += 'actual_seconds_spent DESC, created_at DESC';
        break;
      case 'smartPriority':
      default:
        orderClause += `CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END ASC,
           due_at ASC NULLS LAST, created_at DESC`;
        break;
    }

    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS} FROM tasks ${whereClause} ${orderClause}`,
      values
    );
    return rows;
  }

  /**
   * Find a task by UUID.
   * @param {string} id - UUID string
   * @returns {Promise<Object|null>}
   */
  async function findById(id) {
    const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM tasks WHERE id = $1`, [id]);
    return rows[0] || null;
  }

  /**
   * Create a new task.
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Created task
   */
  async function create(taskData) {
    const {
      title,
      description = '',
      priority = 'medium',
      category = 'General',
      dueAt = null,
      reminderAt = null,
      estimatedMinutes = 25,
      subtasks = [],
      pinned = false,
    } = taskData;

    const { rows } = await pool.query(
      `INSERT INTO tasks (title, description, priority, category, due_at, reminder_at, estimated_minutes, subtasks, pinned)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_FIELDS}`,
      [
        title,
        description,
        priority,
        category,
        dueAt,
        reminderAt,
        estimatedMinutes,
        JSON.stringify(subtasks),
        pinned,
      ]
    );
    return rows[0];
  }

  /**
   * Update a task (partial update).
   * @param {string} id - UUID
   * @param {Object} fields - Fields to update
   * @returns {Promise<Object|null>} Updated task or null if not found
   */
  async function update(id, fields) {
    const allowedFields = [
      'title',
      'description',
      'completed',
      'priority',
      'category',
      'dueAt',
      'reminderAt',
      'reminderSent',
      'estimatedMinutes',
      'actualSecondsSpent',
      'subtasks',
      'pinned',
    ];

    const sets = [];
    const values = [id];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(fields)) {
      if (!allowedFields.includes(key)) continue;

      const columnMap = {
        dueAt: 'due_at',
        reminderAt: 'reminder_at',
        reminderSent: 'reminder_sent',
        estimatedMinutes: 'estimated_minutes',
        actualSecondsSpent: 'actual_seconds_spent',
      };

      const column = columnMap[key] || key;

      if (key === 'subtasks') {
        sets.push(`${column} = $${paramIndex++}`);
        values.push(JSON.stringify(value));
      } else {
        sets.push(`${column} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (sets.length === 0) {
      return findById(id);
    }

    // updated_at is handled by trigger

    const { rows } = await pool.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $1 RETURNING ${SELECT_FIELDS}`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Delete a task by ID and return deleted row for undo.
   * @param {string} id - UUID
   * @returns {Promise<Object|null>} Deleted task or null
   */
  async function deleteById(id) {
    const { rows } = await pool.query(
      `DELETE FROM tasks WHERE id = $1 RETURNING ${SELECT_FIELDS}`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Clear all completed tasks.
   * @returns {Promise<Array<Object>>} Deleted tasks
   */
  async function clearCompleted() {
    const { rows } = await pool.query(
      `DELETE FROM tasks WHERE completed = true RETURNING ${SELECT_FIELDS}`
    );
    return rows;
  }

  /**
   * Get tasks needing reminder (for notification engine).
   * @returns {Promise<Array<Object>>}
   */
  async function getTasksNeedingReminder() {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS} FROM tasks
       WHERE completed = false
         AND reminder_at IS NOT NULL
         AND reminder_sent = false
         AND reminder_at <= now()`
    );
    return rows;
  }

  /**
   * Mark reminder as sent.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function markReminderSent(id) {
    await pool.query(`UPDATE tasks SET reminder_sent = true WHERE id = $1`, [id]);
  }

  /**
   * Get database stats for health check.
   * @returns {Promise<Object>}
   */
  async function getStats() {
    const { rows } = await pool.query(
      `SELECT NOW() AS server_time, current_database() AS db_name, count(*)::int AS total_tasks FROM tasks`
    );
    return rows[0];
  }

  /**
   * Cheap health check - simple query with latency measurement.
   * @returns {Promise<{healthy: boolean, latencyMs: number}>}
   */
  async function checkHealth() {
    const start = process.hrtime.bigint();
    try {
      await pool.query('SELECT 1');
      const end = process.hrtime.bigint();
      const latencyMs = Number(end - start) / 1_000_000;
      return { healthy: true, latencyMs };
    } catch {
      return { healthy: false, latencyMs: 0 };
    }
  }

  return {
    findAll,
    findById,
    create,
    update,
    deleteById,
    clearCompleted,
    getTasksNeedingReminder,
    markReminderSent,
    getStats,
    checkHealth,
  };
}
