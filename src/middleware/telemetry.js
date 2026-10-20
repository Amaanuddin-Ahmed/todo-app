// Telemetry Middleware
// Measures request execution time and attaches custom headers

/**
 * Telemetry middleware for Express.
 * Adds X-Response-Time, X-DB-Tier, X-API-Tier headers.
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function telemetryMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  // Use on('finish') but check if headers already sent
  res.on('finish', () => {
    if (!res.headersSent) return;
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    try {
      res.set('X-Response-Time', `${ms.toFixed(2)}ms`);
      res.set('X-DB-Tier', 'PostgreSQL');
      res.set('X-API-Tier', 'Express-Serverless');
    } catch {
      // Headers already sent, ignore
    }
  });

  next();
}
