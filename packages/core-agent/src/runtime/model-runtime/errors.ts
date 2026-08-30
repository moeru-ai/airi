import type { ModelConnectionErrorFields } from '../../contracts/model-runtime-port'

import { errorMessageFrom } from '@moeru/std'
import { APICallError } from '@xsai/shared'

import { errorMessageFromValue } from '../../utils/error-message'

const RETRYABLE_CODES = new Set<ModelConnectionErrorFields['code']>([
  'network-unreachable',
  'dns-failed',
  'tls-failed',
  'timeout',
  'rate-limited',
  'upstream-error',
])

/**
 * Structured custom-model failure that callers can throw or emit.
 *
 * The message is redacted. Do not put API keys or secret header values here.
 */
export class ModelConnectionError extends Error implements ModelConnectionErrorFields {
  readonly stage: ModelConnectionErrorFields['stage']
  readonly code: ModelConnectionErrorFields['code']
  readonly status?: number
  readonly retryable: boolean

  constructor(fields: ModelConnectionErrorFields) {
    super(redactSecretText(fields.message))
    this.name = 'ModelConnectionError'
    this.stage = fields.stage
    this.code = fields.code
    this.status = fields.status
    this.retryable = fields.retryable
  }

  /** Serializes the public error contract without the Error prototype. */
  toJSON(): ModelConnectionErrorFields {
    return {
      stage: this.stage,
      code: this.code,
      message: this.message,
      ...(this.status != null ? { status: this.status } : {}),
      retryable: this.retryable,
    }
  }
}

/**
 * Returns true when `error` is a {@link ModelConnectionError}.
 */
export function isModelConnectionError(error: unknown): error is ModelConnectionError {
  return error instanceof ModelConnectionError
}

/**
 * Removes secret-like tokens from an error or log string.
 *
 * @example
 * redactSecretText('Remote sent 401: Bearer sk-live')
 * // => 'Remote sent 401: Bearer [redacted]'
 */
export function redactSecretText(value: string): string {
  return value
    .replace(/(Bearer)\s+\S+/gi, '$1 [redacted]')
    .replace(/((?:x-api-key|api[_-]?key|authorization)\s*[:=]\s*)\S+/gi, '$1[redacted]')
    .replace(/\bsk-[\w-]+\b/g, '[redacted]')
}

/**
 * Maps an HTTP status to a connection error code.
 */
export function modelConnectionCodeFromStatus(status: number): ModelConnectionErrorFields['code'] {
  if (status === 401)
    return 'unauthorized'
  if (status === 403)
    return 'forbidden'
  if (status === 404)
    return 'not-found'
  if (status === 408 || status === 504)
    return 'timeout'
  if (status === 429)
    return 'rate-limited'
  if (status >= 500)
    return 'upstream-error'
  if (status >= 400)
    return 'upstream-error'
  return 'unknown'
}

/**
 * Builds a structured error from an HTTP status.
 */
export function modelConnectionErrorFromStatus(
  status: number,
  message: string,
  stage: ModelConnectionErrorFields['stage'],
): ModelConnectionError {
  const code = modelConnectionCodeFromStatus(status)
  return new ModelConnectionError({
    stage,
    code,
    message: message || `Remote sent ${status} response.`,
    status,
    retryable: RETRYABLE_CODES.has(code),
  })
}

/**
 * Maps a thrown value onto {@link ModelConnectionError}.
 *
 * Web-opaque `TypeError` network failures use `browser-request-blocked`.
 */
export function toModelConnectionError(
  error: unknown,
  stage: ModelConnectionErrorFields['stage'],
): ModelConnectionError {
  if (error instanceof ModelConnectionError) {
    if (error.stage === stage)
      return error
    return new ModelConnectionError({
      stage,
      code: error.code,
      message: error.message,
      ...(error.status != null ? { status: error.status } : {}),
      retryable: error.retryable,
    })
  }

  if (isAbortError(error)) {
    const timedOut = isTimeoutAbort(error)
    return new ModelConnectionError({
      stage,
      code: timedOut ? 'timeout' : 'unknown',
      message: timedOut ? 'The request timed out.' : 'The request was aborted.',
      retryable: false,
    })
  }

  if (APICallError.isInstance(error)) {
    return modelConnectionErrorFromStatus(
      error.statusCode,
      redactSecretText(error.message),
      stage,
    )
  }

  const status = readErrorStatus(error)
  if (status != null) {
    return modelConnectionErrorFromStatus(
      status,
      redactSecretText(errorMessageFromValue(error)),
      stage,
    )
  }

  const code = classifyNetworkFailure(error)
  const message = redactSecretText(
    errorMessageFrom(error) ?? errorMessageFromValue(error),
  )

  return new ModelConnectionError({
    stage,
    code,
    message: message || 'The request failed.',
    retryable: RETRYABLE_CODES.has(code),
  })
}

/**
 * Causes that a browser-opaque network failure can have.
 *
 * The browser does not tell CORS, network, and TLS apart. The UI must list
 * all three.
 */
export const BROWSER_REQUEST_BLOCKED_CAUSES = ['cors', 'network', 'tls'] as const

/** One possible cause of a `browser-request-blocked` failure. */
export type BrowserRequestBlockedCause = typeof BROWSER_REQUEST_BLOCKED_CAUSES[number]

/**
 * Diagnostic payload for a Web opaque network failure.
 *
 * Use this when the transport code is `browser-request-blocked`. Do not pick
 * one cause as the only explanation.
 */
export interface BrowserRequestBlockedDiagnostics {
  code: 'browser-request-blocked'
  possibleCauses: readonly BrowserRequestBlockedCause[]
  nextSteps: readonly string[]
}

const BROWSER_REQUEST_BLOCKED_NEXT_STEPS = [
  'Check that the upstream service allows browser CORS.',
  'Check the network path and DNS.',
  'Check the TLS certificate.',
  'Use the Electron desktop app when the browser cannot reach the service.',
] as const

/**
 * Lists CORS, network, and TLS as possible causes of a browser-opaque failure.
 *
 * @example
 * listBrowserRequestBlockedCauses()
 * // => ['cors', 'network', 'tls']
 */
export function listBrowserRequestBlockedCauses(): readonly BrowserRequestBlockedCause[] {
  return BROWSER_REQUEST_BLOCKED_CAUSES
}

/**
 * Builds the Web diagnostic for a `browser-request-blocked` failure.
 *
 * The helper does not claim one cause. The UI lists CORS, network, and TLS,
 * then suggests Electron when the browser cannot reach the service.
 */
export function createBrowserRequestBlockedDiagnostics(): BrowserRequestBlockedDiagnostics {
  return {
    code: 'browser-request-blocked',
    possibleCauses: BROWSER_REQUEST_BLOCKED_CAUSES,
    nextSteps: BROWSER_REQUEST_BLOCKED_NEXT_STEPS,
  }
}

/**
 * Classifies a fetch/network failure without an HTTP status.
 *
 * Node `cause.code` values map to dns, TLS, timeout, and reachability. Opaque
 * browser `TypeError` values map to `browser-request-blocked`.
 */
export function classifyNetworkFailure(error: unknown): ModelConnectionErrorFields['code'] {
  const code = readErrorCode(error)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return 'dns-failed'
  if (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'CERT_HAS_EXPIRED'
    || code === 'ERR_TLS_CERT_ALTNAME_INVALID'
    || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
  ) {
    return 'tls-failed'
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT')
    return 'timeout'
  if (code === 'ECONNREFUSED' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH')
    return 'network-unreachable'

  const message = errorMessageFromValue(error)
  if (/certificate|ssl|tls/i.test(message))
    return 'tls-failed'
  if (/enotfound|getaddrinfo|dns/i.test(message))
    return 'dns-failed'
  if (/timeout/i.test(message))
    return 'timeout'
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message))
    return 'browser-request-blocked'
  if (/fetch failed/i.test(message))
    return 'network-unreachable'
  if (error instanceof TypeError)
    return typeof globalThis.document === 'undefined' ? 'network-unreachable' : 'browser-request-blocked'

  return 'unknown'
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError')
    return true
  if (error instanceof Error && error.name === 'AbortError')
    return true
  return false
}

function isTimeoutAbort(error: unknown): boolean {
  const reason = error instanceof Error && 'cause' in error
    ? error.cause
    : undefined
  const text = [
    errorMessageFromValue(error),
    errorMessageFromValue(reason),
    typeof reason === 'string' ? reason : '',
  ].join(' ')
  return text === 'timeout' || /\btimeout\b/i.test(text)
}

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error == null)
    return undefined

  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    status_code?: unknown
  }

  for (const value of [candidate.status, candidate.statusCode, candidate.status_code]) {
    if (typeof value === 'number' && Number.isFinite(value))
      return value
  }

  return undefined
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error == null)
    return undefined

  const candidate = error as { code?: unknown, cause?: { code?: unknown } }
  if (typeof candidate.code === 'string')
    return candidate.code
  if (typeof candidate.cause?.code === 'string')
    return candidate.cause.code
  return undefined
}
