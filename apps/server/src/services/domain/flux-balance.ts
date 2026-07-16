export type FluxBalanceBucket = 'zero' | '1_100' | '101_1000' | '1001_10000' | '10000_plus' | 'unknown'

/**
 * Normalizes exact Flux balance values into analytics-safe buckets.
 *
 * Before:
 * - 0
 * - 42
 * - 1200
 *
 * After:
 * - "zero"
 * - "1_100"
 * - "1001_10000"
 */
export function fluxBalanceBucket(balance: number | null | undefined): FluxBalanceBucket {
  if (balance == null || Number.isNaN(balance))
    return 'unknown'
  if (balance <= 0)
    return 'zero'
  if (balance <= 100)
    return '1_100'
  if (balance <= 1000)
    return '101_1000'
  if (balance <= 10000)
    return '1001_10000'
  return '10000_plus'
}
