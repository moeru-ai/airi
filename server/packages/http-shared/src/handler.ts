import type { Logger } from '@guiiai/logg'
import type { Env, ErrorHandler } from 'hono'

import { ApiError, createInternalError } from './error'

/**
 * Creates the Hono `onError` handler that writes the JSON error body.
 *
 * The body is `{ error, message, details? }` with the HTTP status of the
 * error. An error that is not an {@link ApiError} becomes a 500 response
 * without its message.
 *
 * `details` and `cause` go to the log for each status except 401 and 429.
 * `cause` never goes to the client, because it can contain upstream content.
 */
export function createErrorHandler<E extends Env>(logger: Logger): ErrorHandler<E> {
  return (err, c) => {
    if (err instanceof ApiError) {
      const logFields = { details: err.details, cause: err.cause }

      if (err.statusCode >= 500) {
        logger.withError(err).withFields(logFields).error('API error occurred')
      }
      // 401 and 429 are expected rejections. The rate limiter records 429 in a metric.
      else if (err.statusCode !== 401 && err.statusCode !== 429) {
        logger.withError(err).withFields(logFields).warn('API error occurred')
      }

      return c.json({
        error: err.errorCode,
        message: err.message,
        details: err.details,
      }, err.statusCode)
    }

    logger.withError(err).error('Unhandled error')
    const internalError = createInternalError()
    return c.json({
      error: internalError.errorCode,
      message: internalError.message,
    }, internalError.statusCode)
  }
}
