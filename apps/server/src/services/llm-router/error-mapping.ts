import type { ApiError } from '../../utils/error'

import { createBadGatewayError, createGatewayTimeoutError, createInternalError, createServiceUnavailableError } from '../../utils/error'

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
 *
 * Returns:
 * - `504 GATEWAY_TIMEOUT` when the last attempt timed out.
 * - `503 SERVICE_UNAVAILABLE` when the last attempt was a 429 (so retry-able
 *   rate-limit hints reach the client correctly).
 * - `502 BAD_GATEWAY` for every other non-2xx upstream status (401/402/403,
 *   5xx, anything else).
 */
export function mapUpstreamError(status: number | 'timeout', context: UpstreamErrorContext): ApiError {
  const details = {
    triedKeys: context.triedKeys,
    triedUpstreams: context.triedUpstreams,
    lastStatusCode: context.lastStatusCode,
  }

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
