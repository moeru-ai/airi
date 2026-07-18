import { HTTPError } from 'h3'

export interface HttpErrorInput {
  status: number
  code: string
  message: string
  reason?: string
  details?: unknown
  expose?: boolean
}

export interface H3HttpErrorOptions {
  headers?: HeadersInit
}

/**
 * Unified HTTP error shape for AIRI local HTTP server modules.
 *
 * Use when:
 * - Returning typed errors from internal server modules
 * - Keeping stable error code + reason metadata for logging/debugging
 *
 * Expects:
 * - `code` is a stable machine-readable value
 * - `message` is safe for clients when `expose` is true
 *
 * Returns:
 * - Error instance with status and structured metadata
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly reason?: string
  readonly details?: unknown
  readonly expose: boolean

  constructor(input: HttpErrorInput) {
    super(input.message)
    this.name = 'HttpError'
    this.status = input.status
    this.code = input.code
    this.reason = input.reason
    this.details = input.details
    this.expose = input.expose ?? false
  }
}

/**
 * Converts a local `HttpError` into an h3-compatible throwable error.
 *
 * Use when:
 * - A route catches internal `HttpError` values and must throw an h3 HTTP error
 *
 * Expects:
 * - `error.message` is only exposed when `error.expose` is true
 *
 * Returns:
 * - `HTTPError` preserving status while controlling client-visible message
 */
export function toH3HttpError(error: HttpError, options: H3HttpErrorOptions = {}) {
  return HTTPError.status(error.status, error.expose ? error.message : defaultHttpMessage(error.status), {
    headers: options.headers,
  })
}

function defaultHttpMessage(status: number) {
  if (status === 400)
    return 'Bad Request'
  if (status === 401)
    return 'Unauthorized'
  if (status === 403)
    return 'Forbidden'
  if (status === 404)
    return 'Not Found'
  if (status >= 500)
    return 'Internal Server Error'
  return 'Request Failed'
}
