/**
 * Policy: retry behavior for failed pipeline stages.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number
  /** Base delay between retries in milliseconds */
  baseDelayMs: number
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 1000,
  exponentialBackoff: true,
}

/**
 * Calculate delay for a given retry attempt.
 */
export function getRetryDelay(policy: RetryPolicy, attempt: number): number {
  if (policy.exponentialBackoff) {
    return policy.baseDelayMs * 2 ** attempt
  }
  return policy.baseDelayMs
}
