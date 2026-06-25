import { errorMessageFrom } from '@moeru/std'

/**
 * Returns a stable human-readable message for an unknown error.
 *
 * Use when:
 * - Surfacing arbitrary thrown values (network failures, third-party errors,
 *   non-Error throws) to the UI as a string.
 *
 * Expects:
 * - `error` may be anything — Error, string, plain object, undefined.
 *
 * Returns:
 * - The first non-empty message extracted by {@link errorMessageFrom},
 *   else `unknownMessage`, else the literal `'Unknown error'`.
 */
export function errorMessageFromUnknown(error: unknown, unknownMessage?: string): string {
  return errorMessageFrom(error) ?? unknownMessage ?? 'Unknown error'
}

/**
 * Returns a human-readable message while preserving JavaScript string fallback.
 *
 * Use when:
 * - Existing code intentionally falls back to `String(error)`.
 * - Callers need a message for logs, diagnostics, or protocol payloads.
 *
 * Expects:
 * - `error` may be any thrown value.
 *
 * Returns:
 * - The first non-empty message extracted by {@link errorMessageFrom},
 *   else the JavaScript string conversion of the original value.
 */
export function errorMessageFromValue(error: unknown): string {
  return errorMessageFrom(error) ?? String(error)
}
