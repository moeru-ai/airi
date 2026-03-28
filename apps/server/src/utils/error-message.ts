import { errorMessageFrom } from '@moeru/std'

/**
 * Returns a stable human-readable message for unknown errors.
 */
export function errorMessageFromUnknown(error: unknown): string {
  return errorMessageFrom(error) ?? 'Unknown error'
}
