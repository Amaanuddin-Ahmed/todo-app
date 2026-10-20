// Central Error Handler Middleware
// Returns { error: { code, message } } with no stack traces or SQL details.

import { ValidationError } from '../services/tasks-service.js';
import { InvalidIdError } from '../services/tasks-service.js';
import { NotFoundError } from '../services/tasks-service.js';

/**
 * Central error handler.
 * @param {Error} err - Error thrown
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function errorHandler(err, req, res, _next) {
  // Known operational errors
  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, field: err.field },
    });
  }

  if (err instanceof InvalidIdError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  // SyntaxError from express.json() - malformed JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: { code: 'MALFORMED_JSON', message: 'Invalid JSON body' },
    });
  }

  // Unknown errors - log server-side, return generic message
  console.error('💥  Unhandled error:', err);

  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isDev ? err.message : 'An unexpected error occurred',
      ...(isDev && { stack: err.stack }),
    },
  });
}
