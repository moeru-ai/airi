import { merge, sleep } from '@moeru/std'
import { APICallError } from '@xsai/shared'

// NOTICE:
// @moeru/std@0.1.0-beta.17, the version pinned by this workspace's catalog,
// only exports `sleep` from its root entry point; `sleepWithAbort` was added
// in a later beta and isn't reachable here. Retrying mid-backoff after a
// session reset must not fire an extra provider request, so this local
// helper covers that gap with the same reject-on-abort contract.
// Source: node_modules/@moeru/std/package.json `exports` map (no
// `sleepWithAbort` entry) for the resolved beta.17.
// Removal condition: delete once the workspace catalog's @moeru/std version
// exports `sleepWithAbort` from its root entry point, then switch back to
// importing it directly.
function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal)
    return sleep(ms)

  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clearTimeout(timer)
      signal!.removeEventListener('abort', onAbort)
      reject(signal!.reason ?? new DOMException('Aborted', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Broad cause bucket used both to decide retry eligibility and to label
 * telemetry. Kept coarse on purpose: callers should not need provider-specific
 * knowledge to react to a retry.
 */
export type LlmStreamErrorKind
  = | 'rate-limited'
    | 'server'
    | 'network'
    | 'timeout'
    | 'client'
    | 'aborted'
    | 'unknown'

/** Retry policy derived from one thrown error. */
export interface LlmStreamErrorClassification {
  kind: LlmStreamErrorKind
  /** Whether the error is plausibly transient and worth retrying. */
  retryable: boolean
  /** Provider-requested backoff floor read from a `Retry-After` response header, in ms. */
  retryAfterMs?: number
}

// Node's `fetch` (undici) and most HTTP client libraries surface connection-
// level failures as a `TypeError` whose `cause` carries the underlying errno
// code. These are transport failures unrelated to request content, so they
// are safe to retry unconditionally.
const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function networkErrorCodeFrom(error: unknown): string | undefined {
  const direct = (error as { code?: unknown } | null)?.code
  if (typeof direct === 'string')
    return direct

  // `fetch` wraps connection failures as `TypeError('fetch failed')` and
  // attaches the real errno-style error as `cause`.
  const cause = error instanceof Error ? error.cause : undefined
  const causeCode = (cause as { code?: unknown } | null)?.code
  return typeof causeCode === 'string' ? causeCode : undefined
}

/**
 * Reads a `Retry-After` value (seconds or an HTTP date) off already-lowercased
 * fetch `Headers` entries.
 *
 * @example
 * retryAfterMsFromHeaders({ 'retry-after': '2' })
 * // => 2000
 */
function retryAfterMsFromHeaders(headers: Record<string, string> | undefined): number | undefined {
  const raw = headers?.['retry-after']
  if (!raw)
    return undefined

  const seconds = Number(raw)
  if (Number.isFinite(seconds))
    return Math.max(0, seconds * 1000)

  const dateMs = Date.parse(raw)
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - Date.now())
}

/**
 * Classifies an error thrown by an LLM stream request into a retry policy.
 *
 * Use when:
 * - Deciding whether {@link withLlmStreamRetry} should retry a failed
 *   streaming attempt, or labeling retry telemetry with a stable reason.
 *
 * Expects:
 * - `error` is whatever the LLM port rejected with; classification is
 *   defensive and never throws.
 *
 * Returns:
 * - `retryable: false` for anything not positively identified as transient
 *   (unrecognized errors, 4xx other than 429/408, aborts). This is a
 *   deliberately conservative default: retrying a request we don't understand
 *   risks duplicating side effects (e.g. tool calls) for no benefit.
 *
 * @example
 * classifyLlmStreamError(new APICallError('Too Many Requests', {
 *   response: new Response(null, { status: 429, headers: { 'retry-after': '2' } }),
 * }))
 * // => { kind: 'rate-limited', retryable: true, retryAfterMs: 2000 }
 */
export function classifyLlmStreamError(error: unknown): LlmStreamErrorClassification {
  if (isAbortError(error))
    return { kind: 'aborted', retryable: false }

  if (error instanceof APICallError) {
    const retryAfterMs = retryAfterMsFromHeaders(error.responseHeaders)
    if (error.statusCode === 429)
      return { kind: 'rate-limited', retryable: true, retryAfterMs }
    if (error.statusCode === 408)
      return { kind: 'timeout', retryable: true }
    if (error.statusCode >= 500)
      return { kind: 'server', retryable: true }
    // Other 4xx (auth, bad request, not-found model, ...) will fail again
    // identically on retry; surface it immediately instead of burning delay.
    return { kind: 'client', retryable: false }
  }

  const networkCode = networkErrorCodeFrom(error)
  if (networkCode && RETRYABLE_NETWORK_ERROR_CODES.has(networkCode))
    return { kind: 'network', retryable: true }

  return { kind: 'unknown', retryable: false }
}

/** Lifecycle state of one circuit-breaker key. */
export type LlmCircuitBreakerState = 'closed' | 'half-open' | 'open'

/** Tuning knobs for {@link createLlmCircuitBreaker}. */
export interface LlmCircuitBreakerOptions {
  /** Consecutive failures required to open the circuit for one key. @default 5 */
  failureThreshold: number
  /** How long the circuit stays open before allowing one half-open trial, in ms. @default 30_000 */
  cooldownMs: number
  /** Clock used for cooldown timing. @default Date.now */
  now: () => number
}

const circuitBreakerDefaults: LlmCircuitBreakerOptions = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  now: () => Date.now(),
}

interface CircuitEntry {
  state: LlmCircuitBreakerState
  consecutiveFailures: number
  /** Set when the circuit opens; cleared on close. Anchors the cooldown window. */
  openedAt?: number
}

/**
 * Thrown by {@link LlmCircuitBreaker.guard} when a key is open. Distinct from
 * provider errors so callers (and telemetry) can tell "we didn't even try"
 * apart from "the provider rejected the request".
 */
export class LlmCircuitOpenError extends Error {
  readonly key: string
  readonly retryAtMs: number

  constructor(key: string, retryAtMs: number) {
    super(`LLM circuit for "${key}" is open until ${new Date(retryAtMs).toISOString()}`)
    this.name = 'LlmCircuitOpenError'
    this.key = key
    this.retryAtMs = retryAtMs
  }
}

/** Per-model-key failure gate that stops repeated requests to a provider that keeps failing. */
export interface LlmCircuitBreaker {
  /**
   * Throws {@link LlmCircuitOpenError} when `key` is currently open and its
   * cooldown has not elapsed. As a side effect, transitions an
   * elapsed-cooldown circuit to `half-open` so the caller's next attempt is
   * treated as the trial request.
   */
  guard: (key: string) => void
  /** Records a successful call, closing the circuit and resetting its failure count. */
  recordSuccess: (key: string) => void
  /**
   * Records a failed call. Opens the circuit once `failureThreshold`
   * consecutive failures accumulate, or immediately re-opens a `half-open`
   * trial that failed.
   */
  recordFailure: (key: string) => void
  /** Reads the current state for a key without mutating it. */
  getState: (key: string) => LlmCircuitBreakerState
}

/**
 * Creates a circuit breaker that fails fast for a model+provider key after it
 * has failed repeatedly, instead of letting every subsequent chat turn wait
 * out a full request timeout against a provider that is currently down.
 *
 * Use when:
 * - Guarding {@link withLlmStreamRetry} (or any other LLM request path) that
 *   is called repeatedly for the same model key across many chat turns.
 *
 * Expects:
 * - One instance is shared across calls for the same logical runtime; a
 *   breaker created per-request cannot observe repeated failures.
 *
 * Returns:
 * - A breaker with independent state per key, so one failing provider does
 *   not trip requests to a different model or provider.
 */
export function createLlmCircuitBreaker(options?: Partial<LlmCircuitBreakerOptions>): LlmCircuitBreaker {
  const resolved = merge(circuitBreakerDefaults, options)
  const entries = new Map<string, CircuitEntry>()

  function entryFor(key: string): CircuitEntry {
    let entry = entries.get(key)
    if (!entry) {
      entry = { state: 'closed', consecutiveFailures: 0 }
      entries.set(key, entry)
    }
    return entry
  }

  return {
    guard(key) {
      const entry = entryFor(key)
      if (entry.state !== 'open')
        return

      const openedAt = entry.openedAt ?? 0
      const elapsed = resolved.now() - openedAt
      if (elapsed < resolved.cooldownMs)
        throw new LlmCircuitOpenError(key, openedAt + resolved.cooldownMs)

      // Cooldown elapsed: let exactly one call through as the half-open
      // trial. `recordSuccess`/`recordFailure` decide the next state.
      entry.state = 'half-open'
    },
    recordSuccess(key) {
      const entry = entryFor(key)
      entry.state = 'closed'
      entry.consecutiveFailures = 0
      entry.openedAt = undefined
    },
    recordFailure(key) {
      const entry = entryFor(key)
      entry.consecutiveFailures += 1
      if (entry.state === 'half-open' || entry.consecutiveFailures >= resolved.failureThreshold) {
        entry.state = 'open'
        entry.openedAt = resolved.now()
      }
    },
    getState: key => entryFor(key).state,
  }
}

/** One retry decision emitted right before {@link withLlmStreamRetry} sleeps and re-attempts. */
export interface LlmRetryAttemptInfo {
  /** 1-based index of the retry about to run (the initial call is not counted). */
  attempt: number
  /** Backoff delay before this retry, in ms. */
  delayMs: number
  classification: LlmStreamErrorClassification
  error: unknown
}

/** Backoff tuning shared by {@link withLlmStreamRetry}. */
export interface LlmRetryBackoffOptions {
  /** Maximum retry attempts after the first call. @default 2 */
  maxRetries: number
  /** Base delay before the first retry, in ms. @default 500 */
  baseDelayMs: number
  /** Exponential growth factor applied per additional attempt. @default 2 */
  delayFactor: number
  /** Upper bound for the computed backoff delay, in ms. @default 8_000 */
  maxDelayMs: number
}

const retryBackoffDefaults: LlmRetryBackoffOptions = {
  maxRetries: 2,
  baseDelayMs: 500,
  delayFactor: 2,
  maxDelayMs: 8_000,
}

/**
 * Full-jitter exponential backoff: a uniform random delay in
 * `[floorMs, cappedExponentialDelay]`. Jitter avoids many concurrent callers
 * (e.g. several AIRI sessions hitting the same provider) retrying in lockstep
 * after a shared outage.
 *
 * @see {@link https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/}
 */
function backoffDelayMs(attemptIndex: number, backoff: LlmRetryBackoffOptions, floorMs = 0): number {
  const exponential = backoff.baseDelayMs * backoff.delayFactor ** attemptIndex
  const capped = Math.min(exponential, backoff.maxDelayMs)
  return Math.max(floorMs, Math.round(Math.random() * capped))
}

/** Options accepted by {@link withLlmStreamRetry}. */
export interface WithLlmStreamRetryOptions extends Partial<LlmRetryBackoffOptions> {
  /** Circuit breaker key identifying the model+provider pair being called. */
  key: string
  /** Breaker guarding `key`. Omit to retry without circuit protection. */
  circuitBreaker?: LlmCircuitBreaker
  /**
   * Extra caller-owned gate evaluated before honoring
   * {@link classifyLlmStreamError}. Return `false` to stop retrying
   * regardless of classification.
   *
   * `chat-orchestrator-runtime` uses this to refuse retries once any stream
   * output (text, reasoning, or a tool call) has already reached the caller,
   * since this function cannot undo partial output or duplicate-avoid a
   * re-sent tool call.
   */
  shouldRetry?: (error: unknown, classification: LlmStreamErrorClassification, attemptIndex: number) => boolean
  /** Cancels an in-progress backoff sleep between attempts. */
  abortSignal?: AbortSignal
  /** Called once per retry, before the backoff sleep starts. */
  onRetryAttempt?: (info: LlmRetryAttemptInfo) => void
}

/**
 * Runs one LLM stream attempt with circuit-breaker short-circuiting and
 * jittered exponential backoff retries.
 *
 * Use when:
 * - Wrapping an `AgentLLMPort`/`ChatOrchestratorLLMPort` call so transient
 *   provider failures (rate limits, 5xx, network resets) recover
 *   automatically instead of failing the user's turn outright.
 *
 * Expects:
 * - `attempt(attemptIndex)` is safe to call again after a failure. This
 *   function has no way to undo partial output or tool-call side effects from
 *   a failed attempt, so callers must gate re-entry (typically through
 *   `shouldRetry`) to before any such output has been observed.
 *
 * Returns:
 * - The resolved value of the first successful `attempt()` call.
 *
 * @throws {@link LlmCircuitOpenError} when `circuitBreaker` reports `key` as
 *   open; `attempt` is never called in that case.
 * @throws The final classified error once retries are exhausted or
 *   `shouldRetry`/classification disallows another attempt.
 */
export async function withLlmStreamRetry<T>(
  attempt: (attemptIndex: number) => Promise<T>,
  options: WithLlmStreamRetryOptions,
): Promise<T> {
  const { key, circuitBreaker, shouldRetry, abortSignal, onRetryAttempt, ...backoffOverrides } = options
  const backoff = merge(retryBackoffDefaults, backoffOverrides)

  circuitBreaker?.guard(key)

  let attemptIndex = 0
  while (true) {
    try {
      const result = await attempt(attemptIndex)
      circuitBreaker?.recordSuccess(key)
      return result
    }
    catch (error) {
      const classification = classifyLlmStreamError(error)
      const allowRetry = shouldRetry?.(error, classification, attemptIndex) ?? classification.retryable
      const hasRetriesLeft = attemptIndex < backoff.maxRetries

      if (!allowRetry || !hasRetriesLeft) {
        circuitBreaker?.recordFailure(key)
        throw error
      }

      const delayMs = backoffDelayMs(attemptIndex, backoff, classification.retryAfterMs)
      onRetryAttempt?.({ attempt: attemptIndex + 1, delayMs, classification, error })
      // Rejects (and skips the next attempt) when `abortSignal` fires during
      // the wait, so a cancelled/reset session cannot trigger a retry.
      await sleepAbortable(delayMs, abortSignal)
      attemptIndex += 1
    }
  }
}
