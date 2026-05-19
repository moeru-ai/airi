import { describe, expect, it } from 'vitest'

import { ApiError } from '../../../../utils/error'
import { mapUpstreamError } from '../error-mapping'

const exampleContext = { triedKeys: 2, triedUpstreams: 1, lastStatusCode: 401 as const }

describe('mapUpstreamError', () => {
  /**
   * @example mapUpstreamError(401, ctx) → 502 BAD_GATEWAY
   */
  it('401 → 502 BAD_GATEWAY', () => {
    const err = mapUpstreamError(401, { ...exampleContext, lastStatusCode: 401 })
    expect(err).toBeInstanceOf(ApiError)
    expect(err.statusCode).toBe(502)
    expect(err.errorCode).toBe('BAD_GATEWAY')
  })

  it('402 → 502 BAD_GATEWAY (payment required from upstream is still gateway-side per KTD-1)', () => {
    const err = mapUpstreamError(402, { ...exampleContext, lastStatusCode: 402 })
    expect(err.statusCode).toBe(502)
    expect(err.errorCode).toBe('BAD_GATEWAY')
  })

  it('403 → 502 BAD_GATEWAY', () => {
    const err = mapUpstreamError(403, { ...exampleContext, lastStatusCode: 403 })
    expect(err.statusCode).toBe(502)
    expect(err.errorCode).toBe('BAD_GATEWAY')
  })

  it('429 → 503 SERVICE_UNAVAILABLE (rate-limit hint preserves retry-ability)', () => {
    const err = mapUpstreamError(429, { ...exampleContext, lastStatusCode: 429 })
    expect(err.statusCode).toBe(503)
    expect(err.errorCode).toBe('SERVICE_UNAVAILABLE')
  })

  it('500 → 502 BAD_GATEWAY', () => {
    const err = mapUpstreamError(500, { ...exampleContext, lastStatusCode: 500 })
    expect(err.statusCode).toBe(502)
    expect(err.errorCode).toBe('BAD_GATEWAY')
  })

  it('502 → 502 BAD_GATEWAY (upstream 5xx still surfaces as our 502)', () => {
    const err = mapUpstreamError(502, { ...exampleContext, lastStatusCode: 502 })
    expect(err.statusCode).toBe(502)
    expect(err.errorCode).toBe('BAD_GATEWAY')
  })

  it('503 → 502 BAD_GATEWAY (upstream 503 is not retry-after, treat as bad gateway)', () => {
    const err = mapUpstreamError(503, { ...exampleContext, lastStatusCode: 503 })
    expect(err.statusCode).toBe(502)
    expect(err.errorCode).toBe('BAD_GATEWAY')
  })

  it('504 upstream → 502 BAD_GATEWAY (only our own timeouts produce 504)', () => {
    const err = mapUpstreamError(504, { ...exampleContext, lastStatusCode: 504 })
    expect(err.statusCode).toBe(502)
    expect(err.errorCode).toBe('BAD_GATEWAY')
  })

  it('timeout → 504 GATEWAY_TIMEOUT', () => {
    const err = mapUpstreamError('timeout', { ...exampleContext, lastStatusCode: 'timeout' })
    expect(err.statusCode).toBe(504)
    expect(err.errorCode).toBe('GATEWAY_TIMEOUT')
  })

  it('attaches sanitized details (triedKeys / triedUpstreams / lastStatusCode) — no upstream body', () => {
    const err = mapUpstreamError(500, { triedKeys: 4, triedUpstreams: 2, lastStatusCode: 500 })
    expect(err.details).toEqual({ triedKeys: 4, triedUpstreams: 2, lastStatusCode: 500 })
  })

  it('2xx input is a programmer error and throws an internal error (never maps to 5xx)', () => {
    // ROOT CAUSE:
    //
    // If a 2xx status reaches this mapper the caller has already decided the
    // request succeeded but is still trying to map it to a failure. Silently
    // returning 502 would hide that bug. We throw INTERNAL_SERVER_ERROR to
    // surface it instead.
    expect(() => mapUpstreamError(200, { ...exampleContext, lastStatusCode: 200 as unknown as 401 })).toThrow(/success status/)
    expect(() => mapUpstreamError(299, { ...exampleContext, lastStatusCode: 299 as unknown as 401 })).toThrow(/success status/)
  })
})
