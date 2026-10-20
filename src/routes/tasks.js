// Tasks Routes
// GET /api/todos, POST /api/todos, PUT/PATCH /api/todos/:id, DELETE /api/todos/:id

import { Router } from 'express';
import { ValidationError, NotFoundError, InvalidIdError } from '../services/tasks-service.js';

/**
 * Create tasks router with injected service.
 * @param {Object} tasksService - Tasks service instance
 * @returns {Router}
 */
export function createTasksRouter(tasksService) {
  const router = Router();

  // GET /api/todos
  router.get('/todos', async (req, res, next) => {
    try {
      const tasks = await tasksService.getAllTasks(req.query);
      res.json({ tasks });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/todos
  router.post('/todos', async (req, res, next) => {
    try {
      const task = await tasksService.createTask(req.body);
      res.status(201).json({ task });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({
          error: { code: err.code, message: err.message, field: err.field },
        });
      }
      next(err);
    }
  });

  // GET /api/todos/:id
  router.get('/todos/:id', async (req, res, next) => {
    try {
      const task = await tasksService.getTaskById(req.params.id);
      res.json({ task });
    } catch (err) {
      if (err instanceof InvalidIdError) {
        return res.status(400).json({ error: { code: err.code, message: err.message } });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // PUT /api/todos/:id (full replacement)
  router.put('/todos/:id', async (req, res, next) => {
    try {
      const task = await tasksService.replaceTask(req.params.id, req.body);
      res.json({ task });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res
          .status(400)
          .json({ error: { code: err.code, message: err.message, field: err.field } });
      }
      if (err instanceof InvalidIdError) {
        return res.status(400).json({ error: { code: err.code, message: err.message } });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // PATCH /api/todos/:id (partial update)
  router.patch('/todos/:id', async (req, res, next) => {
    try {
      const task = await tasksService.updateTask(req.params.id, req.body);
      res.json({ task });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res
          .status(400)
          .json({ error: { code: err.code, message: err.message, field: err.field } });
      }
      if (err instanceof InvalidIdError) {
        return res.status(400).json({ error: { code: err.code, message: err.message } });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // DELETE /api/todos/:id
  router.delete('/todos/:id', async (req, res, next) => {
    try {
      const deletedTask = await tasksService.deleteTask(req.params.id);
      res.json({ deleted: true, id: deletedTask.id, item: deletedTask });
    } catch (err) {
      if (err instanceof InvalidIdError) {
        return res.status(400).json({ error: { code: err.code, message: err.message } });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // POST /api/todos/clear-completed
  router.post('/todos/clear-completed', async (req, res, next) => {
    try {
      const result = await tasksService.clearCompleted();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
