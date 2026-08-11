import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiError extends Error {
  constructor(
    public readonly statusCode: ContentfulStatusCode,
    public readonly errorCode: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Creates an internal server error (500)
 */
export function createInternalError(message = 'Internal Server Error', details?: unknown) {
  return new ApiError(500, 'INTERNAL_SERVER_ERROR', message, details)
}

/**
 * Creates a bad request error (400)
 */
export function createBadRequestError(message: string, errorCode = 'BAD_REQUEST', details?: unknown) {
  return new ApiError(400, errorCode, message, details)
}

/**
 * Creates an unauthorized error (401)
 */
export function createUnauthorizedError(message = 'Unauthorized', details?: unknown) {
  return new ApiError(401, 'UNAUTHORIZED', message, details)
}

/**
 * Creates a forbidden error (403)
 */
export function createForbiddenError(message = 'Forbidden', details?: unknown) {
  return new ApiError(403, 'FORBIDDEN', message, details)
}

/**
 * Creates a not found error (404)
 */
export function createNotFoundError(message = 'Not Found', details?: unknown) {
  return new ApiError(404, 'NOT_FOUND', message, details)
}

/**
 * Creates a payment required error (402)
 */
export function createPaymentRequiredError(message: string, details?: unknown) {
  return new ApiError(402, 'PAYMENT_REQUIRED', message, details)
}

/**
 * Creates a conflict error (409)
 */
export function createConflictError(message: string, details?: unknown) {
  return new ApiError(409, 'CONFLICT', message, details)
}

/**
 * Creates a service unavailable error (503)
 */
export function createServiceUnavailableError(message = 'Service Unavailable', errorCode = 'SERVICE_UNAVAILABLE', details?: unknown) {
  return new ApiError(503, errorCode, message, details)
}

/**
 * Creates a bad gateway error (502).
 *
 * Use when:
 * - An upstream provider (LLM, TTS, third-party API) returned a fallback-
 *   triggering response (401 / 402 / 403 / 5xx) and the gateway has exhausted
 *   every retry/fallback path. The client must see a gateway-side error code,
 *   not the upstream's status, because the client did nothing wrong.
 *
 * Expects:
 * - `details` is sanitized — never include raw upstream response bodies or
 *   headers (they can leak provider-internal info like subscription IDs,
 *   region identifiers, or rate-limit metadata). Use shape
 *   `{ triedKeys?: number, triedUpstreams?: number, lastStatusCode?: number }`.
 */
export function createBadGatewayError(message = 'Bad Gateway', details?: unknown) {
  return new ApiError(502, 'BAD_GATEWAY', message, details)
}

/**
 * Creates a gateway timeout error (504).
 *
 * Use when:
 * - The gateway aborted an upstream call (or the entire fallback chain) on a
 *   timeout boundary. Distinct from 503: 504 tells clients "retry after a
 *   delay" rather than "service is offline".
 */
export function createGatewayTimeoutError(message = 'Gateway Timeout', details?: unknown) {
  return new ApiError(504, 'GATEWAY_TIMEOUT', message, details)
}
