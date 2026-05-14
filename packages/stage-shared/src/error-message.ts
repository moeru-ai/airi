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
