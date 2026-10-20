// Request Logging Middleware
// Concise, no bodies, no secrets.

/**
 * Simple request logger.
 * Logs: method, path, status, response time.
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    const status = res.statusCode;
    const method = req.method;
    const path = req.originalUrl || req.url;

    // Color by status class
    let color = '\x1b[32m'; // green for 2xx
    if (status >= 400 && status < 500) color = '\x1b[33m'; // yellow for 4xx
    if (status >= 500) color = '\x1b[31m'; // red for 5xx
    const reset = '\x1b[0m';

    console.log(`${color}${method}${reset} ${path} ${color}${status}${reset} ${ms.toFixed(1)}ms`);
  });

  next();
}
