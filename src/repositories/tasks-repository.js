// Tasks Repository - Data Access Layer
// Only place where SQL lives. All queries parameterized.

/**
 * Create a tasks repository using the provided pg Pool.
 * @param {import('pg').Pool} pool - Configured pg connection pool
 * @returns {Object} Repository methods
 */
export function createTasksRepository(pool) {
  /**
   * Find all tasks, newest first.
   * @returns {Promise<Array<Object>>}
   */
  async function findAll() {
    const { rows } = await pool.query(
      `SELECT id, title, completed, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM tasks
       ORDER BY created_at DESC`
    );
    return rows;
  }

  /**
   * Find a task by UUID.
   * @param {string} id - UUID string
   * @returns {Promise<Object|null>}
   */
  async function findById(id) {
    const { rows } = await pool.query(
      `SELECT id, title, completed, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM tasks
       WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Create a new task.
   * @param {string} title - Trimmed, 1-200 chars (validated by caller)
   * @returns {Promise<Object>} Created task
   */
  async function create(title) {
    const { rows } = await pool.query(
      `INSERT INTO tasks (title)
       VALUES ($1)
       RETURNING id, title, completed, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [title]
    );
    return rows[0];
  }

  /**
   * Update a task (partial update).
   * @param {string} id - UUID
   * @param {Object} fields - { completed?: boolean, title?: string }
   * @returns {Promise<Object|null>} Updated task or null if not found
   */
  async function update(id, fields) {
    const sets = [];
    const values = [id];
    let paramIndex = 2;

    if (typeof fields.completed === 'boolean') {
      sets.push(`completed = $${paramIndex++}`);
      values.push(fields.completed);
    }
    if (typeof fields.title === 'string') {
      sets.push(`title = $${paramIndex++}`);
      values.push(fields.title);
    }
    if (sets.length === 0) {
      return findById(id);
    }

    sets.push(`updated_at = now()`);

    const { rows } = await pool.query(
      `UPDATE tasks
       SET ${sets.join(', ')}
       WHERE id = $1
       RETURNING id, title, completed, created_at AS "createdAt", updated_at AS "updatedAt"`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Delete a task by ID.
   * @param {string} id - UUID
   * @returns {Promise<boolean>} True if deleted
   */
  async function deleteById(id) {
    const { rowCount } = await pool.query(`DELETE FROM tasks WHERE id = $1`, [id]);
    return rowCount > 0;
  }

  /**
   * Cheap health check - simple query.
   * @returns {Promise<boolean>}
   */
  async function checkHealth() {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  return {
    findAll,
    findById,
    create,
    update,
    deleteById,
    checkHealth,
  };
}
