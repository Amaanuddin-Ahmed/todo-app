// API Client - Fetch wrapper with timeout, normalized errors, and telemetry metrics

const DEFAULT_TIMEOUT = 10_000; // 10 seconds

/**
 * Custom error class for API errors.
 */
export class ApiError extends Error {
  constructor(message, code, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Telemetry subscribers for the Three-Tier Architecture Inspector
const telemetryListeners = new Set();
let latestTelemetry = {
  latencyMs: 0,
  status: 'Connected',
  method: 'GET',
  path: '/api/health',
  statusCode: 200,
  sql: 'SELECT 1;',
  timestamp: new Date().toISOString(),
};

/**
 * Subscribe to API telemetry events.
 * @param {(event: Object) => void} listener
 * @returns {() => void} Unsubscribe function
 */
export function onTelemetry(listener) {
  telemetryListeners.add(listener);
  listener(latestTelemetry);
  return () => telemetryListeners.delete(listener);
}

/**
 * Get latest recorded telemetry state.
 */
export function getLatestTelemetry() {
  return latestTelemetry;
}

/**
 * Infer parameterized SQL statement executed for a given REST call.
 */
function inferSql(method, path, body) {
  const cleanPath = path.split('?')[0];

  if (cleanPath === '/api/health') {
    return `SELECT NOW() AS server_time, current_database() AS db_name, count(*)::int AS total_tasks FROM tasks;`;
  }
  if ((cleanPath === '/api/todos' || cleanPath === '/api/tasks') && method === 'GET') {
    return `SELECT id, title, description, completed, priority, category, due_at, reminder_at, estimated_minutes, actual_seconds_spent, subtasks, pinned FROM tasks WHERE ... ORDER BY pinned DESC, completed ASC, CASE priority ...;`;
  }
  if ((cleanPath === '/api/todos' || cleanPath === '/api/tasks') && method === 'POST') {
    return `INSERT INTO tasks (title, description, priority, category, due_at, reminder_at, estimated_minutes, subtasks, pinned) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;`;
  }
  if (cleanPath.includes('/clear-completed') && method === 'POST') {
    return `DELETE FROM tasks WHERE completed = true RETURNING *;`;
  }
  if (method === 'PATCH' || method === 'PUT') {
    const id = cleanPath.split('/').pop();
    const keys = body ? Object.keys(body) : ['updated_at'];
    return `UPDATE tasks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *; -- id: ${id}`;
  }
  if (method === 'DELETE') {
    const id = cleanPath.split('/').pop();
    return `DELETE FROM tasks WHERE id = $1 RETURNING *; -- id: ${id}`;
  }
  return `SELECT 1;`;
}

/**
 * Emit telemetry record to all listeners.
 */
function recordTelemetry(meta) {
  latestTelemetry = {
    ...meta,
    timestamp: new Date().toISOString(),
  };
  telemetryListeners.forEach(listener => {
    try {
      listener(latestTelemetry);
    } catch (e) {
      console.warn('Telemetry listener error:', e);
    }
  });
}

/**
 * Fetch with timeout and latency telemetry.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<{response: Response, latencyMs: number}>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;
    return { response, latencyMs };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;
    recordTelemetry({
      latencyMs,
      status: 'Error',
      method: options.method || 'GET',
      path: url,
      statusCode: 0,
      sql: inferSql(options.method || 'GET', url),
      error: err.message,
    });

    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out', 'TIMEOUT', 0);
    }
    throw new ApiError('Network error', 'NETWORK_ERROR', 0, { original: err.message });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse JSON response, handling non-JSON responses.
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function parseJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new ApiError(
      `Unexpected response (${response.status})`,
      'INVALID_RESPONSE',
      response.status,
      { body: text.slice(0, 200) }
    );
  }
  return response.json();
}

/**
 * Normalize error response from API.
 * @param {Response} response
 * @param {any} data
 * @returns {ApiError}
 */
function createApiError(response, data) {
  const code = data?.error?.code || `HTTP_${response.status}`;
  const message = data?.error?.message || response.statusText || 'Unknown error';
  const details = data?.error ? { field: data.error.field } : {};
  return new ApiError(message, code, response.status, details);
}

/**
 * GET request.
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function apiGet(path) {
  const { response, latencyMs } = await fetchWithTimeout(path, { method: 'GET' });
  const data = await parseJson(response);

  recordTelemetry({
    latencyMs,
    status: response.ok ? 'Connected' : 'Error',
    method: 'GET',
    path,
    statusCode: response.status,
    sql: inferSql('GET', path),
    responseTimeHeader: response.headers.get('x-response-time'),
    dbTier: response.headers.get('x-db-tier') || 'PostgreSQL',
    apiTier: response.headers.get('x-api-tier') || 'Express-Serverless',
  });

  if (!response.ok) {
    throw createApiError(response, data);
  }
  return data;
}

/**
 * POST request.
 * @param {string} path
 * @param {Object} body
 * @returns {Promise<any>}
 */
export async function apiPost(path, body) {
  const { response, latencyMs } = await fetchWithTimeout(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await parseJson(response);

  recordTelemetry({
    latencyMs,
    status: response.ok ? 'Connected' : 'Error',
    method: 'POST',
    path,
    statusCode: response.status,
    sql: inferSql('POST', path, body),
    responseTimeHeader: response.headers.get('x-response-time'),
    dbTier: response.headers.get('x-db-tier') || 'PostgreSQL',
    apiTier: response.headers.get('x-api-tier') || 'Express-Serverless',
  });

  if (!response.ok) {
    throw createApiError(response, data);
  }
  return data;
}

/**
 * PATCH request.
 * @param {string} path
 * @param {Object} body
 * @returns {Promise<any>}
 */
export async function apiPatch(path, body) {
  const { response, latencyMs } = await fetchWithTimeout(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const data = await parseJson(response);

  recordTelemetry({
    latencyMs,
    status: response.ok ? 'Connected' : 'Error',
    method: 'PATCH',
    path,
    statusCode: response.status,
    sql: inferSql('PATCH', path, body),
    responseTimeHeader: response.headers.get('x-response-time'),
    dbTier: response.headers.get('x-db-tier') || 'PostgreSQL',
    apiTier: response.headers.get('x-api-tier') || 'Express-Serverless',
  });

  if (!response.ok) {
    throw createApiError(response, data);
  }
  return data;
}

/**
 * PUT request.
 * @param {string} path
 * @param {Object} body
 * @returns {Promise<any>}
 */
export async function apiPut(path, body) {
  const { response, latencyMs } = await fetchWithTimeout(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const data = await parseJson(response);

  recordTelemetry({
    latencyMs,
    status: response.ok ? 'Connected' : 'Error',
    method: 'PUT',
    path,
    statusCode: response.status,
    sql: inferSql('PUT', path, body),
    responseTimeHeader: response.headers.get('x-response-time'),
    dbTier: response.headers.get('x-db-tier') || 'PostgreSQL',
    apiTier: response.headers.get('x-api-tier') || 'Express-Serverless',
  });

  if (!response.ok) {
    throw createApiError(response, data);
  }
  return data;
}

/**
 * DELETE request.
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function apiDelete(path) {
  const { response, latencyMs } = await fetchWithTimeout(path, { method: 'DELETE' });
  const data = await parseJson(response).catch(() => ({ deleted: true }));

  recordTelemetry({
    latencyMs,
    status: response.ok ? 'Connected' : 'Error',
    method: 'DELETE',
    path,
    statusCode: response.status,
    sql: inferSql('DELETE', path),
    responseTimeHeader: response.headers.get('x-response-time'),
    dbTier: response.headers.get('x-db-tier') || 'PostgreSQL',
    apiTier: response.headers.get('x-api-tier') || 'Express-Serverless',
  });

  if (!response.ok) {
    throw createApiError(response, data);
  }
  return data;
}
