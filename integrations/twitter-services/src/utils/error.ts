/**
 * Safely extract error message from any error type
 * Handles Error objects, strings, objects, and other types
 *
 * @param error - Any error object
 * @param fallbackMessage - Fallback message when unable to extract a message
 * @returns Formatted error message
 */
export function errorToMessage(error: unknown, fallbackMessage = 'Unknown error'): string {
  if (error === null || error === undefined) {
    return fallbackMessage
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error
  }

  // Handle objects with message property
  if (typeof error === 'object') {
    // Check if it has a message property
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message
    }

    // Try to convert object to string
    try {
      return JSON.stringify(error)
    }
    catch {
      // If serialization fails, return object's string representation
      return String(error)
    }
  }

  // For other cases, try to force convert to string
  return String(error)
}

/**
 * Create an error with detailed context information
 *
 * @param message - Error message
 * @param originalError - Original error object (optional)
 * @param context - Additional context information (optional)
 * @returns Enhanced error object
 */
export function createError(
  message: string,
  originalError?: unknown,
  context?: Record<string, unknown>,
): Error {
  let errorMessage = message

  // Add original error information
  if (originalError) {
    errorMessage += `: ${errorToMessage(originalError)}`
  }

  // Create new error object
  const error = new Error(errorMessage)

  // Add context information
  if (context) {
    Object.assign(error, { context })
  }

  return error
}
