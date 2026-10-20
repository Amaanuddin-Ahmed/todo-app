// Tasks Routes
// GET /api/tasks, POST /api/tasks, PATCH /api/tasks/:id, DELETE /api/tasks/:id

import { Router } from 'express';
import { ValidationError, NotFoundError, InvalidIdError } from '../services/tasks-service.js';

/**
 * Create tasks router with injected service.
 * @param {Object} tasksService - Tasks service instance
 * @returns {Router}
 */
export function createTasksRouter(tasksService) {
  const router = Router();

  // GET /api/tasks
  router.get('/tasks', async (req, res, next) => {
    try {
      const tasks = await tasksService.getAllTasks();
      res.json({ tasks });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/tasks
  router.post('/tasks', async (req, res, next) => {
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

  // PATCH /api/tasks/:id
  router.patch('/tasks/:id', async (req, res, next) => {
    try {
      const task = await tasksService.updateTask(req.params.id, req.body);
      res.json({ task });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({
          error: { code: err.code, message: err.message, field: err.field },
        });
      }
      if (err instanceof InvalidIdError) {
        return res.status(400).json({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  // DELETE /api/tasks/:id
  router.delete('/tasks/:id', async (req, res, next) => {
    try {
      await tasksService.deleteTask(req.params.id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof InvalidIdError) {
        return res.status(400).json({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  return router;
}
