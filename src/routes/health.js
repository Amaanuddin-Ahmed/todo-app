// Health Check Route
// GET /api/health -> 200 { status: "ok" } or 503

import { Router } from 'express';

/**
 * Create health router with injected service.
 * @param {Object} tasksService - Tasks service instance
 * @returns {Router}
 */
export function createHealthRouter(tasksService) {
  const router = Router();

  router.get('/health', async (req, res, next) => {
    try {
      const healthy = await tasksService.checkHealth();
      if (healthy) {
        return res.status(200).json({ status: 'ok' });
      }
      return res.status(503).json({
        error: { code: 'DB_UNAVAILABLE', message: 'Database connection failed' },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
