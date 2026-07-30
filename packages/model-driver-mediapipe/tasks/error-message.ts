import { errorMessageFrom } from '@moeru/std'

/**
 * Returns an error message while preserving JavaScript string fallback.
 *
 * Use when:
 * - Task scripts need a message for arbitrary thrown values.
 *
 * Expects:
 * - `error` may be any thrown value.
 *
 * Returns:
 * - The extracted error message, else `String(error)`.
 */
export function errorMessageFromValue(error: unknown): string {
  return errorMessageFrom(error) ?? String(error)
}
