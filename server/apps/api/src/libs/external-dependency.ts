import { withRetry } from '@moeru/std'

const EXTERNAL_DEPENDENCY_INIT_MAX_ATTEMPTS = 5
const EXTERNAL_DEPENDENCY_INIT_BASE_DELAY_MS = 5000

interface ExternalDependencyLogger {
  log: (message: string) => unknown
  withError: (error: unknown) => {
    warn: (message: string) => unknown
  }
}

export async function initializeExternalDependency<T>(
  dependencyName: string,
  logger: ExternalDependencyLogger,
  initialize: (attempt: number) => Promise<T>,
): Promise<T> {
  let attempt = 0

  return await withRetry(
    async () => {
      attempt += 1
      return await initialize(attempt)
    },
    {
      retry: EXTERNAL_DEPENDENCY_INIT_MAX_ATTEMPTS - 1,
      retryDelay: EXTERNAL_DEPENDENCY_INIT_BASE_DELAY_MS,
      retryDelayFactor: 2,
      retryDelayMax: EXTERNAL_DEPENDENCY_INIT_BASE_DELAY_MS * 2 ** (EXTERNAL_DEPENDENCY_INIT_MAX_ATTEMPTS - 1),
      onError: (error) => {
        logger.withError(error).warn(`${dependencyName} initialization failed on attempt ${attempt}/${EXTERNAL_DEPENDENCY_INIT_MAX_ATTEMPTS}`)
      },
    },
  )()
}
