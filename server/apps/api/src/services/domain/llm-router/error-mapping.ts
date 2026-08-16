import type { ApiError } from '../../../utils/error'

import { createBadGatewayError, createGatewayTimeoutError, createInternalError, createServiceUnavailableError } from '../../../utils/error'

/**
 * Sanitized context for `mapUpstreamError`.
 *
 * Per SEC-5: upstream response bodies and headers must never enter this
 * shape. Body content can leak provider-internal info (subscription IDs,
 * region tags, rate-limit metadata) to the end client. Only counts and the
 * final status code are safe to surface.
 */
export interface UpstreamErrorContext {
  /** How many distinct keys were attempted across all upstreams. */
  triedKeys: number
  /** How many distinct upstreams were attempted. */
  triedUpstreams: number
  /** The status of the **last** attempt — drives the 502/503/504 selection. */
  lastStatusCode: number | 'timeout'
}

/**
 * One recorded upstream attempt. Carries the raw provider response snippet
 * and network error message so operators can diagnose 502s without re-
 * probing the upstream. Lives on `ApiError.cause`, never on `details`, so
 * SEC-5 (no upstream content in client-facing response body) still holds.
 */
export interface UpstreamAttempt {
  provider: string
  keyId: string
  status: number | 'timeout'
  /**
   * First ≤256 bytes of the upstream response body when the attempt
   * received an HTTP response. Helps tell apart "key invalid", "region
   * blocked", "model not enabled" without re-running the request.
   */
  bodySnippet?: string
  /**
   * Result of `errorMessageFrom(err)` when the attempt threw before getting
   * an HTTP response (per-attempt timeout, DNS, ECONNRESET) or when an
   * adapter wrapped a network failure. TTS adapters bake the body snippet
   * into this message, so chat upstreams populate `bodySnippet` and TTS
   * upstreams populate `errorMessage`.
   */
  errorMessage?: string
}

/**
 * Server-only cause attached to the {@link ApiError} that
 * {@link mapUpstreamError} produces. Surfaced through logger + OTel
 * span attributes, never through the HTTP response body.
 */
export interface RouterErrorCause {
  attempts: UpstreamAttempt[]
}

/**
 * Map a final upstream failure to a client-facing {@link ApiError} per
 * KTD-1 last-attempt-wins policy.
 *
 * Use when:
 * - The router has exhausted every (upstream, key) combo. The status code
 *   of the **last** attempt drives the response.
 *
 * Expects:
 * - `status` is a non-2xx HTTP code or the literal `'timeout'` token. Passing
 *   a 2xx code is a programmer error (this mapper should only run after the
 *   router decides every attempt failed) and throws an internal error.
 * - `attempts` (when provided) lists every recorded upstream attempt.
 *   Attached to `ApiError.cause` so logger / OTel can surface the real
 *   upstream message; SEC-5 forbids the same content on `details`.
 *
 * Returns:
 * - `504 GATEWAY_TIMEOUT` when the last attempt timed out.
 * - `503 SERVICE_UNAVAILABLE` when the last attempt was a 429 (so retry-able
 *   rate-limit hints reach the client correctly).
 * - `502 BAD_GATEWAY` for every other non-2xx upstream status (401/402/403,
 *   5xx, anything else).
 */
export function mapUpstreamError(
  status: number | 'timeout',
  context: UpstreamErrorContext,
  attempts?: UpstreamAttempt[],
): ApiError {
  const details = {
    triedKeys: context.triedKeys,
    triedUpstreams: context.triedUpstreams,
    lastStatusCode: context.lastStatusCode,
  }

  const apiErr = buildApiError(status, details)
  if (attempts != null && attempts.length > 0) {
    // Server-only cause. Logger / OTel pick this up; SEC-5 keeps it out
    // of the client-facing response body.
    const cause: RouterErrorCause = { attempts }
    ;(apiErr as { cause?: unknown }).cause = cause
  }
  return apiErr
}

function buildApiError(status: number | 'timeout', details: UpstreamErrorContext): ApiError {
  if (status === 'timeout')
    return createGatewayTimeoutError('Upstream timeout', details)

  // Programmer error: only non-2xx statuses should reach this mapper. We
  // refuse to return 502 for a 2xx because that masks a real bug — the
  // caller decided the request succeeded somewhere upstream of here.
  if (status >= 200 && status < 300) {
    throw createInternalError(
      `mapUpstreamError received success status ${status} — only non-2xx upstream statuses should reach this mapper`,
      details,
    )
  }

  if (status === 429)
    return createServiceUnavailableError('Upstream rate-limited', 'SERVICE_UNAVAILABLE', details)

  return createBadGatewayError('Upstream unavailable', details)
}
