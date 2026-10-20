// Health Check Route
// GET /api/health -> detailed telemetry

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
      const start = process.hrtime.bigint();
      const health = await tasksService.checkHealth();
      const dbLatencyMs = health.latencyMs;
      const stats = await tasksService.getStats();

      if (!health.healthy) {
        return res.status(503).json({
          status: 'degraded',
          tiers: {
            browser: 'Connected',
            express: 'Online',
            postgres: 'Disconnected',
          },
          dbLatencyMs: null,
          totalTasks: 0,
          timestamp: new Date().toISOString(),
        });
      }

      res.set({
        'X-Response-Time': `${(Number(process.hrtime.bigint() - start) / 1_000_000).toFixed(2)}ms`,
        'X-DB-Tier': 'PostgreSQL',
        'X-API-Tier': 'Express-Serverless',
      });

      return res.status(200).json({
        status: 'healthy',
        tiers: {
          browser: 'Connected',
          express: 'Online',
          postgres: 'Connected',
        },
        dbLatencyMs,
        totalTasks: stats.total_tasks,
        timestamp: stats.server_time,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
