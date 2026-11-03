import { errorMessageFromValue } from '../utils/error-message'

export type AuvExecutorErrorCategory
  = | 'unsupported'
    | 'not_found'
    | 'timeout'
    | 'unavailable'
    | 'unknown'

export class AuvExecutorError extends Error {
  readonly category: AuvExecutorErrorCategory
  readonly details?: Record<string, unknown>

  constructor(category: AuvExecutorErrorCategory, message: string, options?: { cause?: unknown, details?: Record<string, unknown> }) {
    super(`auv ${category}: ${message}`, options)
    this.name = 'AuvExecutorError'
    this.category = category
    this.details = options?.details
  }
}

const grpcCodeCategory = new Map<number, AuvExecutorErrorCategory>([
  [4, 'timeout'],
  [5, 'not_found'],
  [12, 'unsupported'],
  [14, 'unavailable'],
])

export function classifyAuvError(error: unknown): AuvExecutorErrorCategory {
  if (error instanceof AuvExecutorError)
    return error.category

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown, rpcCode?: unknown }
    if (candidate.name === 'AbortError' || candidate.name === 'AuvAbortError')
      return 'timeout'

    if (typeof candidate.rpcCode === 'number')
      return grpcCodeCategory.get(candidate.rpcCode) ?? 'unknown'
  }

  return 'unknown'
}

export function wrapAuvError(operation: string, error: unknown): AuvExecutorError {
  if (error instanceof AuvExecutorError)
    return error

  const category = classifyAuvError(error)
  return new AuvExecutorError(category, `${operation} failed: ${errorMessageFromValue(error)}`, { cause: error })
}
