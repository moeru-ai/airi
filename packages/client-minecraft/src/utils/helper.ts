export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Returns a retirable anonymous function with configured retryLimit and delayInterval
 *
 * @param retryLimit Number of retry attempts
 * @param delayInterval Delay between retries in milliseconds
 * @param func Function to be called
 * @returns A wrapped function with the same signature as func
 */
export function toRetriable<A, R>(
  retryLimit: number,
  delayInterval: number,
  func: (...args: A[]) => Promise<R>,
  hooks?: {
    onError?: (err: unknown) => void
  },
): (...args: A[]) => Promise<R> {
  let retryCount = 0
  return async function (args: A): Promise<R> {
    try {
      return await func(args)
    }
    catch (err) {
      if (hooks?.onError) {
        hooks.onError(err)
      }

      if (retryCount < retryLimit) {
        retryCount++
        await sleep(delayInterval)
        return await toRetriable(retryLimit - retryCount, delayInterval, func)(args)
      }
      else {
        throw err
      }
    }
  }
}
