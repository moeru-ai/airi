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
 * Creates a forbidden error (403)
 */
export function createForbiddenError(message = 'Forbidden', details?: unknown) {
  return new ApiError(403, 'FORBIDDEN', message, details)
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
