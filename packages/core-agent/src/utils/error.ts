import { errorMessageFrom } from '@moeru/std'

/** Returns a message for runtime diagnostics, including values thrown without an Error wrapper. */
export function errorMessageFromValue(error: unknown): string {
  return errorMessageFrom(error) ?? String(error)
}

/**
 * Preserves an Error thrown by a provider and wraps other thrown values with operation context.
 *
 * @example
 * errorFromCause('offline', 'Speech synthesis failed')
 * // => Error('Speech synthesis failed', { cause: 'offline' })
 */
export function errorFromCause(cause: unknown, message: string): Error {
  return cause instanceof Error ? cause : new Error(message, { cause })
}
