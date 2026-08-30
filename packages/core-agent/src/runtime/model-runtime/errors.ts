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

  constructor(fields: ModelConnectionErrorFields, secrets: readonly string[] = EMPTY_SECRETS) {
    super(redactSecretText(fields.message, secrets))
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

const EMPTY_SECRETS: readonly string[] = Object.freeze([])
const NON_SECRET_HEADER_NAMES = new Set([
  'accept',
  'content-type',
  'anthropic-version',
])

/**
 * Collects configured auth and secret-header values for diagnostic redaction.
 *
 * Custom Model keys are arbitrary strings. The helper keeps the header value
 * and, for Bearer, the token after `Bearer`.
 *
 * @example
 * secretValuesFromHeaders({ authorization: 'Bearer gateway-token', 'X-Token': 'secret-header' })
 * // => ['Bearer gateway-token', 'gateway-token', 'secret-header']
 */
export function secretValuesFromHeaders(headers: Record<string, string>): string[] {
  const secrets: string[] = []
  for (const [name, value] of Object.entries(headers)) {
    if (NON_SECRET_HEADER_NAMES.has(name.toLowerCase()))
      continue
    const token = value.trim()
    if (!token)
      continue
    pushUniqueSecret(secrets, token)
    const bearerToken = token.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    if (bearerToken)
      pushUniqueSecret(secrets, bearerToken)
  }
  return secrets
}

/**
 * Removes secret tokens from an error or log string.
 *
 * Keys are arbitrary strings. Do not treat `sk-*` as a secret shape.
 * A model ID can use that shape. Redact labeled Bearer / API Key values
 * and the configured secrets.
 *
 * @example
 * redactSecretText('Remote sent 401: Bearer gateway-token')
 * // => 'Remote sent 401: Bearer [redacted]'
 *
 * @example
 * redactSecretText('gateway echoed X-Token: secret-header', ['secret-header'])
 * // => 'gateway echoed X-Token: [redacted]'
 *
 * @example
 * redactSecretText('model sk-abc failed')
 * // => 'model sk-abc failed'
 */
export function redactSecretText(value: string, secrets: readonly string[] = EMPTY_SECRETS): string {
  let redacted = value
  for (const token of configuredSecretTokens(secrets))
    redacted = redacted.split(token).join('[redacted]')

  return redacted
    .replace(/(Bearer)\s+\S+/gi, '$1 [redacted]')
    .replace(/((?:x-api-key|api[\s_-]?key|authorization)\s*[:=]\s*)\S+/gi, '$1[redacted]')
}

function pushUniqueSecret(secrets: string[], token: string): void {
  if (!secrets.includes(token))
    secrets.push(token)
}

function configuredSecretTokens(secrets: readonly string[]): string[] {
  return secrets
    .map(secret => secret.trim())
    .filter(token => token.length > 0)
    .sort((left, right) => right.length - left.length)
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
  secrets: readonly string[] = EMPTY_SECRETS,
): ModelConnectionError {
  const code = modelConnectionCodeFromStatus(status)
  return new ModelConnectionError({
    stage,
    code,
    message: message || `Remote sent ${status} response.`,
    status,
    retryable: RETRYABLE_CODES.has(code),
  }, secrets)
}

/**
 * Maps a thrown value onto {@link ModelConnectionError}.
 *
 * Web-opaque `TypeError` network failures use `browser-request-blocked`.
 */
export function toModelConnectionError(
  error: unknown,
  stage: ModelConnectionErrorFields['stage'],
  secrets: readonly string[] = EMPTY_SECRETS,
): ModelConnectionError {
  if (error instanceof ModelConnectionError) {
    if (error.stage === stage && secrets.length === 0)
      return error
    return new ModelConnectionError({
      stage,
      code: error.code,
      message: error.message,
      ...(error.status != null ? { status: error.status } : {}),
      retryable: error.retryable,
    }, secrets)
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
      error.message,
      stage,
      secrets,
    )
  }

  const status = readErrorStatus(error)
  if (status != null) {
    return modelConnectionErrorFromStatus(
      status,
      errorMessageFromValue(error),
      stage,
      secrets,
    )
  }

  const code = classifyNetworkFailure(error)
  const message = errorMessageFrom(error) ?? errorMessageFromValue(error)

  return new ModelConnectionError({
    stage,
    code,
    message: message || 'The request failed.',
    retryable: RETRYABLE_CODES.has(code),
  }, secrets)
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
