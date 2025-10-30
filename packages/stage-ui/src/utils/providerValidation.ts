/**
 * Formats various types of error inputs into safe, user-friendly messages.
 */
export function formatErrorForUser(err: unknown): string {
  if (!err)
    return ''

  if (err instanceof Error)
    return err.message

  if (typeof err === 'string')
    return err

  return String(err)
}

/**
 * Standardized structure for provider validation results.
 */
export interface ProviderValidationResult {
  errors: Error[]
  reason: string
  valid: boolean
}

/**
 * Builds a normalized validation result object.
 */
export function buildValidationResult(
  errors: (Error | null | undefined)[],
  responseOk: boolean,
): ProviderValidationResult {
  const cleanErrors = errors.filter(Boolean) as Error[]
  const reason = cleanErrors.map(e => formatErrorForUser(e)).join(', ') || ''
  return {
    errors: cleanErrors,
    reason,
    valid: responseOk,
  }
}

/**
 * Builds a failed validation result for unreachable services.
 */
export function buildFetchErrorResult(serviceName: string, err: unknown): ProviderValidationResult {
  const formatted = formatErrorForUser(err)
  return {
    errors: [err instanceof Error ? err : new Error(formatted)],
    reason: `Failed to reach ${serviceName}, error: ${formatted} occurred.`,
    valid: false,
  }
}
