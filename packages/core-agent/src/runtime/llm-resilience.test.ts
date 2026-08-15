import { APICallError } from '@xsai/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  classifyLlmStreamError,
  createLlmCircuitBreaker,
  LlmCircuitOpenError,
  withLlmStreamRetry,
} from './llm-resilience'

function apiCallError(status: number, headers: Record<string, string> = {}) {
  return new APICallError(`Remote sent ${status} response`, {
    response: new Response(null, { status, headers }),
    responseBody: '',
  })
}

describe('classifyLlmStreamError', () => {
  it('classifies 429 as retryable and reads retry-after seconds', () => {
    const result = classifyLlmStreamError(apiCallError(429, { 'retry-after': '2' }))
    expect(result).toEqual({ kind: 'rate-limited', retryable: true, retryAfterMs: 2000 })
  })

  it('classifies 408 as a retryable timeout', () => {
    expect(classifyLlmStreamError(apiCallError(408))).toEqual({ kind: 'timeout', retryable: true })
  })

  it('classifies 500 and above as a retryable server error', () => {
    expect(classifyLlmStreamError(apiCallError(500))).toEqual({ kind: 'server', retryable: true })
    expect(classifyLlmStreamError(apiCallError(503))).toEqual({ kind: 'server', retryable: true })
  })

  it('classifies other 4xx as a non-retryable client error', () => {
    expect(classifyLlmStreamError(apiCallError(401))).toEqual({ kind: 'client', retryable: false })
    expect(classifyLlmStreamError(apiCallError(400))).toEqual({ kind: 'client', retryable: false })
  })

  it('classifies aborts as non-retryable', () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    expect(classifyLlmStreamError(abortError)).toEqual({ kind: 'aborted', retryable: false })
  })

  it('classifies fetch connection failures as retryable network errors', () => {
    // ROOT CAUSE:
    // Node's `fetch` wraps connection-level failures (e.g. a refused or reset
    // TCP connection) as `TypeError('fetch failed')` and attaches the real
    // errno-style diagnostic as `cause`, matching undici's documented shape.
    const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    const fetchFailed = Object.assign(new TypeError('fetch failed'), { cause })
    expect(classifyLlmStreamError(fetchFailed)).toEqual({ kind: 'network', retryable: true })
  })

  it('classifies an unrecognized error as non-retryable by default', () => {
    expect(classifyLlmStreamError(new Error('unexpected provider error'))).toEqual({ kind: 'unknown', retryable: false })
    expect(classifyLlmStreamError('a thrown string')).toEqual({ kind: 'unknown', retryable: false })
  })

  it('omits retryAfterMs when no retry-after header is present', () => {
    const result = classifyLlmStreamError(apiCallError(429))
    expect(result.retryAfterMs).toBeUndefined()
  })
})

describe('createLlmCircuitBreaker', () => {
  it('stays closed below the failure threshold', () => {
    const breaker = createLlmCircuitBreaker({ failureThreshold: 3 })
    breaker.recordFailure('model-a')
    breaker.recordFailure('model-a')
    expect(breaker.getState('model-a')).toBe('closed')
    expect(() => breaker.guard('model-a')).not.toThrow()
  })

  it('opens once consecutive failures reach the threshold and fails fast', () => {
    let now = 0
    const breaker = createLlmCircuitBreaker({ failureThreshold: 2, cooldownMs: 30_000, now: () => now })

    breaker.recordFailure('model-a')
    breaker.recordFailure('model-a')
    expect(breaker.getState('model-a')).toBe('open')

    now += 1000
    expect(() => breaker.guard('model-a')).toThrow(LlmCircuitOpenError)
  })

  it('keeps failure state independent per key', () => {
    const breaker = createLlmCircuitBreaker({ failureThreshold: 1 })
    breaker.recordFailure('model-a')
    expect(breaker.getState('model-a')).toBe('open')
    expect(breaker.getState('model-b')).toBe('closed')
    expect(() => breaker.guard('model-b')).not.toThrow()
  })

  it('moves to half-open after the cooldown elapses, then closes on a successful trial', () => {
    let now = 0
    const breaker = createLlmCircuitBreaker({ failureThreshold: 1, cooldownMs: 10_000, now: () => now })

    breaker.recordFailure('model-a')
    expect(breaker.getState('model-a')).toBe('open')

    now += 10_000
    expect(() => breaker.guard('model-a')).not.toThrow()
    expect(breaker.getState('model-a')).toBe('half-open')

    breaker.recordSuccess('model-a')
    expect(breaker.getState('model-a')).toBe('closed')
  })

  it('re-opens immediately when a half-open trial fails', () => {
    let now = 0
    const breaker = createLlmCircuitBreaker({ failureThreshold: 1, cooldownMs: 10_000, now: () => now })

    breaker.recordFailure('model-a')
    now += 10_000
    breaker.guard('model-a')
    expect(breaker.getState('model-a')).toBe('half-open')

    breaker.recordFailure('model-a')
    expect(breaker.getState('model-a')).toBe('open')

    now += 1
    expect(() => breaker.guard('model-a')).toThrow(LlmCircuitOpenError)
  })

  it('reports the cooldown deadline on LlmCircuitOpenError', () => {
    let now = 1_000
    const breaker = createLlmCircuitBreaker({ failureThreshold: 1, cooldownMs: 5_000, now: () => now })
    breaker.recordFailure('model-a')

    now += 1
    try {
      breaker.guard('model-a')
      expect.unreachable('guard() must throw while the circuit is open')
    }
    catch (error) {
      expect(error).toBeInstanceOf(LlmCircuitOpenError)
      expect((error as LlmCircuitOpenError).key).toBe('model-a')
      expect((error as LlmCircuitOpenError).retryAtMs).toBe(6_000)
    }
  })
})

describe('withLlmStreamRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Backoff jitter is `Math.random() * cappedDelay`; pinning it to 1 makes
    // each computed delay the deterministic upper bound so tests can advance
    // fake timers by an exact amount instead of a range.
    vi.spyOn(Math, 'random').mockReturnValue(1)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the result of the first successful attempt without retrying', async () => {
    const attempt = vi.fn().mockResolvedValue('ok')
    const result = await withLlmStreamRetry(attempt, { key: 'model-a' })
    expect(result).toBe('ok')
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('retries a retryable error after the jittered backoff delay', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(apiCallError(503))
      .mockResolvedValueOnce('ok')
    const onRetryAttempt = vi.fn()

    const pending = withLlmStreamRetry(attempt, {
      key: 'model-a',
      baseDelayMs: 500,
      delayFactor: 2,
      maxDelayMs: 8_000,
      onRetryAttempt,
    })

    await vi.advanceTimersByTimeAsync(500)
    await expect(pending).resolves.toBe('ok')
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(onRetryAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      delayMs: 500,
      classification: { kind: 'server', retryable: true },
    }))
  })

  it('does not retry a non-retryable error', async () => {
    const clientError = apiCallError(401)
    const attempt = vi.fn().mockRejectedValue(clientError)

    await expect(withLlmStreamRetry(attempt, { key: 'model-a' })).rejects.toBe(clientError)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('stops retrying once maxRetries is exhausted and rethrows the last error', async () => {
    const serverError = apiCallError(500)
    const attempt = vi.fn().mockRejectedValue(serverError)

    const pending = withLlmStreamRetry(attempt, { key: 'model-a', maxRetries: 2, baseDelayMs: 100 })
    const assertion = expect(pending).rejects.toBe(serverError)

    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(200)
    await assertion
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('honors a caller-supplied shouldRetry gate over the default classification', async () => {
    // ROOT CAUSE:
    // `chat-orchestrator-runtime` must refuse retries once any stream output
    // has already reached the caller (retrying would duplicate that output),
    // even for an error `classifyLlmStreamError` would otherwise retry.
    const serverError = apiCallError(500)
    const attempt = vi.fn().mockRejectedValue(serverError)
    const shouldRetry = vi.fn().mockReturnValue(false)

    await expect(withLlmStreamRetry(attempt, { key: 'model-a', shouldRetry })).rejects.toBe(serverError)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(shouldRetry).toHaveBeenCalledWith(serverError, { kind: 'server', retryable: true }, 0)
  })

  it('rejects immediately without calling attempt when the circuit is open', async () => {
    const breaker = createLlmCircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000 })
    breaker.recordFailure('model-a')
    const attempt = vi.fn()

    await expect(withLlmStreamRetry(attempt, { key: 'model-a', circuitBreaker: breaker }))
      .rejects
      .toBeInstanceOf(LlmCircuitOpenError)
    expect(attempt).not.toHaveBeenCalled()
  })

  it('records success and failure against the circuit breaker for the same key', async () => {
    const breaker = createLlmCircuitBreaker({ failureThreshold: 5 })
    const recordSuccess = vi.spyOn(breaker, 'recordSuccess')
    const recordFailure = vi.spyOn(breaker, 'recordFailure')

    await withLlmStreamRetry(vi.fn().mockResolvedValue('ok'), { key: 'model-a', circuitBreaker: breaker })
    expect(recordSuccess).toHaveBeenCalledWith('model-a')

    const clientError = apiCallError(400)
    await expect(withLlmStreamRetry(vi.fn().mockRejectedValue(clientError), { key: 'model-a', circuitBreaker: breaker }))
      .rejects
      .toBe(clientError)
    expect(recordFailure).toHaveBeenCalledWith('model-a')
  })

  it('rejects and stops retrying when abortSignal fires during the backoff wait', async () => {
    const controller = new AbortController()
    const attempt = vi.fn().mockRejectedValue(apiCallError(500))

    const pending = withLlmStreamRetry(attempt, { key: 'model-a', baseDelayMs: 1000, abortSignal: controller.signal })
    const assertion = pending.catch((error: unknown) => error)

    controller.abort()
    const rejection = await assertion
    expect(rejection).toMatchObject({ name: 'AbortError' })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('floors the backoff delay at a rate-limited error\'s retry-after value', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(apiCallError(429, { 'retry-after': '5' }))
      .mockResolvedValueOnce('ok')

    // Pin jitter to 0 so the delay would otherwise be 0; the retry-after
    // floor of 5000ms must still be honored.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const pending = withLlmStreamRetry(attempt, { key: 'model-a', baseDelayMs: 100 })
    await vi.advanceTimersByTimeAsync(5000)
    await expect(pending).resolves.toBe('ok')
  })
})
