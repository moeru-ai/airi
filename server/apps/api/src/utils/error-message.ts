import { errorMessageFrom } from '@moeru/std'

/**
 * Returns a stable human-readable message for unknown errors.
 */
export function errorMessageFromUnknown(error: unknown, unknownMessage?: string): string {
  return errorMessageFrom(error) ?? unknownMessage ?? 'Unknown error'
}
