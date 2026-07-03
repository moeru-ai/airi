import type { BreakerRegistry } from './registry'

import { BrokenCircuitError, circuitBreaker, ConsecutiveBreaker, handleAll } from 'cockatiel'
import { sharedBreakerRegistry } from './registry'

export interface ResilientFetchOptions extends RequestInit {
  /** Circuit-breaker name (e.g. `comfyui:http`, `nanobanana:gen`). Default: derived from URL. */
  breakerName?: string
  /** Consecutive failures before the breaker trips. Default 5. */
  breakerThreshold?: number
  /** Time the breaker stays open before entering half-open. Default 30_000. */
  breakerOpenForMs?: number
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number
  /** Max retries after the initial attempt on transient errors. Default 2. */
  retryAttempts?: number
  /** Custom registry — the shared app-wide one is used when omitted. */
  registry?: BreakerRegistry
}

const DEFAULTS = {
  breakerThreshold: 5,
  breakerOpenForMs: 30_000,
  timeoutMs: 30_000,
  retryAttempts: 2,
} as const

function deriveKey(input: string): string {
  return input.replace(/^https?:\/\//, '').split('/')[0] ?? input
}

/** Returns true for transient (retryable) errors — 5xx and network errors. */
function isRetryableFetchError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status
    if (status >= 400 && status < 500) {
      return false
    }
  }
  return true
}

function buildResiliencePolicy(opts: Required<Pick<ResilientFetchOptions, 'breakerThreshold' | 'breakerOpenForMs'>>) {
  // The breaker's inner policy filters which errors count as failures:
  // - 5xx / non-Response errors count as failures (these also drive retry)
  // - 4xx responses count as success (never retry, never break)
  const inner = handleAll.orWhen(isRetryableFetchError)

  return circuitBreaker(inner, {
    breaker: new ConsecutiveBreaker(opts.breakerThreshold),
    halfOpenAfter: opts.breakerOpenForMs,
  })
}

export async function resilientFetch(input: string | URL, init: ResilientFetchOptions = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString()
  const {
    breakerName,
    breakerThreshold,
    breakerOpenForMs,
    timeoutMs,
    retryAttempts,
    registry = sharedBreakerRegistry,
    ...fetchInit
  } = { ...DEFAULTS, ...init }

  const key = breakerName ?? deriveKey(url)

  if (!registry.has(key)) {
    const policy = buildResiliencePolicy({
      breakerThreshold,
      breakerOpenForMs,
    })
    registry.set(key, policy)
  }

  const policy = registry.get(key)!

  // Combine caller-supplied signal with our per-request timeout.
  const controller = new AbortController()
  const onOuterAbort = () => controller.abort()
  if (fetchInit.signal) {
    fetchInit.signal.addEventListener('abort', onOuterAbort, { once: true })
  }
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  const cleanup = () => {
    if (timer) clearTimeout(timer)
    if (fetchInit.signal) fetchInit.signal.removeEventListener('abort', onOuterAbort)
  }

  // Retry loop. We retry on transient errors only — 4xx responses pass
  // through without retry or breaker-attribution because the inner
  // policy classifies them as non-failures.
  let attempt = 0
  const maxAttempts = retryAttempts + 1 // 1 initial + N retries

  while (attempt < maxAttempts) {
    attempt++
    try {
      const response = (await policy.execute(async () => {
        const r = await fetch(url, { ...fetchInit, signal: controller.signal })

        // 5xx responses are transient: classify them as errors so they
        // drive breaker + retry. 4xx pass-through so callers can inspect.
        if (r.status >= 500) {
          throw Object.assign(new Error(`Upstream ${r.status} ${r.statusText}`), { status: r.status })
        }
        return r
      })) as Response

      cleanup()
      return response
    } catch (error) {
      // Circuit open — return synthetic 503 immediately.
      if (error instanceof BrokenCircuitError) {
        cleanup()
        return new Response(
          JSON.stringify({
            error: 'circuit-open',
            message: `Circuit breaker open for ${key} — provider is unreachable`,
            breakerKey: key,
          }),
          {
            status: 503,
            statusText: 'Service Unavailable (circuit open)',
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      // Last attempt: rethrow any non-retryable error.
      if (attempt >= maxAttempts || !isRetryableFetchError(error)) {
        cleanup()
        throw error
      }

      // Exponential backoff before retry.
      const backoff = Math.min(1000 * 2 ** attempt, 10_000)
      await new Promise((resolve) => setTimeout(resolve, backoff))
    }
  }

  // Unreachable, but satisfies TypeScript.
  cleanup()
  throw new Error(`resilientFetch: exhausted retries for ${url}`)
}

export { BrokenCircuitError }

/** Resilience package version (bumped per change for observability). */
export const RESILIENCE_VERSION = '0.1.0'
