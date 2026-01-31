/**
 * Common types shared across base provider interfaces
 */

/**
 * Validation result for provider configuration
 */
export interface ProviderValidationResult {
  errors: unknown[]
  reason: string
  valid: boolean
}
