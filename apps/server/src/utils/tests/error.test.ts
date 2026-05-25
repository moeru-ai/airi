import { describe, expect, it } from 'vitest'

import {
  ApiError,
  createBadGatewayError,
  createBadRequestError,
  createConflictError,
  createForbiddenError,
  createGatewayTimeoutError,
  createInternalError,
  createNotFoundError,
  createPaymentRequiredError,
  createServiceUnavailableError,
  createUnauthorizedError,
} from '../error'

describe('ApiError helpers', () => {
  it('stores status, code, message, and details on ApiError instances', () => {
    const details = { key: 'value' }
    const err = new ApiError(418, 'TEAPOT', 'Short and stout', details)

    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ApiError')
    expect(err.statusCode).toBe(418)
    expect(err.errorCode).toBe('TEAPOT')
    expect(err.message).toBe('Short and stout')
    expect(err.details).toBe(details)
  })

  it('creates default HTTP error shapes used by route handlers', () => {
    expect(createInternalError()).toMatchObject({
      statusCode: 500,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Internal Server Error',
    })
    expect(createUnauthorizedError()).toMatchObject({
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
      message: 'Unauthorized',
    })
    expect(createForbiddenError()).toMatchObject({
      statusCode: 403,
      errorCode: 'FORBIDDEN',
      message: 'Forbidden',
    })
    expect(createNotFoundError()).toMatchObject({
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Not Found',
    })
    expect(createServiceUnavailableError()).toMatchObject({
      statusCode: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      message: 'Service Unavailable',
    })
    expect(createBadGatewayError()).toMatchObject({
      statusCode: 502,
      errorCode: 'BAD_GATEWAY',
      message: 'Bad Gateway',
    })
    expect(createGatewayTimeoutError()).toMatchObject({
      statusCode: 504,
      errorCode: 'GATEWAY_TIMEOUT',
      message: 'Gateway Timeout',
    })
  })

  it('preserves caller-provided messages, codes, and details', () => {
    const details = { reason: 'bad-input' }

    expect(createBadRequestError('Bad shape', 'INVALID_SHAPE', details)).toMatchObject({
      statusCode: 400,
      errorCode: 'INVALID_SHAPE',
      message: 'Bad shape',
      details,
    })
    expect(createPaymentRequiredError('Flux required', details)).toMatchObject({
      statusCode: 402,
      errorCode: 'PAYMENT_REQUIRED',
      message: 'Flux required',
      details,
    })
    expect(createConflictError('Already exists', details)).toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      message: 'Already exists',
      details,
    })
    expect(createServiceUnavailableError('Router missing config', 'CONFIG_NOT_SET', details)).toMatchObject({
      statusCode: 503,
      errorCode: 'CONFIG_NOT_SET',
      message: 'Router missing config',
      details,
    })
  })
})
