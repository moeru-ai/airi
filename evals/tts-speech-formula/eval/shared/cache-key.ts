import { createHash } from 'node:crypto'

/**
 * Builds one cache key segment from every input that changes a cached answer.
 *
 * @example
 * cacheKey('zh', '$x$')
 * // => 'b5f3…' (32 hex characters)
 */
export function cacheKey(...parts: string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)
}
