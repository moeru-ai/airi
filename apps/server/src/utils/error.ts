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
 * Creates a conflict error (409)
 */
export function createConflictError(message: string, details?: unknown) {
  return new ApiError(409, 'CONFLICT', message, details)
}
