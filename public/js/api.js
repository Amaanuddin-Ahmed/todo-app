// API Client - Fetch wrapper with timeout and normalized errors

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

/**
 * Fetch with timeout.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return response;
  } catch (err) {
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
  const response = await fetchWithTimeout(path, { method: 'GET' });
  const data = await parseJson(response);

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
  const response = await fetchWithTimeout(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await parseJson(response);

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
  const response = await fetchWithTimeout(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw createApiError(response, data);
  }
  return data;
}

/**
 * DELETE request.
 * @param {string} path
 * @returns {Promise<void>}
 */
export async function apiDelete(path) {
  const response = await fetchWithTimeout(path, { method: 'DELETE' });

  if (!response.ok) {
    const data = await parseJson(response).catch(() => ({}));
    throw createApiError(response, data);
  }
  // 204 No Content - no body to parse
}
