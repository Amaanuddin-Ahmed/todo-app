// Express App Factory
// Exports createApp({ tasksRepository }) for testability.
// src/app.js wires the real pg repository and default-exports the app.

import express from 'express';
import helmet from 'helmet';
import { createHealthRouter } from './routes/health.js';
import { createTasksRouter } from './routes/tasks.js';
import { createTasksService } from './services/tasks-service.js';
import { requestLogger } from './middleware/logging.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireJson } from './middleware/validation.js';
import { telemetryMiddleware } from './middleware/telemetry.js';

/**
 * Optionally attach database pool for Vercel Fluid Compute.
 * @param {import('express').Express} app
 * @param {import('pg').Pool} pool
 */
async function maybeAttachDatabasePool(app, pool) {
  try {
    const mod = await import('@vercel/functions');
    if (typeof mod.attachDatabasePool === 'function') {
      mod.attachDatabasePool(app, pool);
    }
  } catch {
    // @vercel/functions not available or no attachDatabasePool export - ignore
  }
}

/**
 * Create Express application with injected dependencies.
 * @param {Object} options
 * @param {Object} [options.tasksRepository] - Repository instance (required for production)
 * @param {import('pg').Pool} [options.pool] - pg Pool (for Vercel attachDatabasePool)
 * @returns {import('express').Express}
 */
export function createApp({ tasksRepository, pool } = {}) {
  const app = express();

  // Trust proxy for correct IP behind Vercel
  app.set('trust proxy', true);

  // Security headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // We set CSP via vercel.json for static assets
      crossOriginEmbedderPolicy: false,
    })
  );

  // Body parser with limit
  app.use(express.json({ limit: '10kb' }));

  // Request logging
  app.use(requestLogger);

  // Telemetry middleware (measures response time, adds headers)
  app.use(telemetryMiddleware);

  // Require JSON for mutating methods
  app.use(requireJson);

  // Attach database pool for Vercel Fluid Compute (harmless locally)
  if (pool) {
    // Use async IIFE to avoid blocking app creation
    maybeAttachDatabasePool(app, pool).catch(() => {});
  }

  // Wire up services and routes
  const tasksService = createTasksService(tasksRepository);

  // API routes
  app.use('/api', createHealthRouter(tasksService));
  app.use('/api', createTasksRouter(tasksService));

  // 404 for unknown /api routes (JSON)
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'API route not found' },
    });
  });

  // Central error handler (must be last)
  app.use(errorHandler);

  return app;
}
