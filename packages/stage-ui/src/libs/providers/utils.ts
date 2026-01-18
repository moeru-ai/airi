/**
 * Shared utility functions for provider implementations
 */

/**
 * Normalize a string value by trimming whitespace
 */
function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Normalize a base URL by ensuring it ends with a trailing slash
 *
 * @param value - The base URL value (can be string, undefined, or other types)
 * @returns Normalized base URL with trailing slash, or empty string if invalid
 */
export function normalizeBaseUrl(value: unknown): string {
  let base = normalizeString(value)
  if (base && !base.endsWith('/'))
    base += '/'
  return base
}
