import { useAsyncState } from './use-async-state'

export interface UseOptimisticOptions<T, R> {
  /**
   * The optimistic update logic.
   * Should return a rollback function.
   */
  apply: () => Promise<(() => Promise<void> | void)> | (() => Promise<void> | void)
  /**
   * The actual async task (e.g., API call).
   */
  action: () => Promise<T>
  /**
   * Optional callback after successful action to refine state (e.g., replacing temp IDs).
   */
  onSuccess?: (result: T) => Promise<R> | R
  /**
   * Optional callback on error. Rollback is handled automatically.
   */
  onError?: (error: unknown) => void | Promise<void>
}

/**
 * A wrapper for performing optimistic updates with automatic rollback.
 * Integrates with useAsyncState for loading/error tracking.
 */
export function useOptimistic<T, R = T>(options: UseOptimisticOptions<T, R>) {
  const { apply, action, onSuccess, onError } = options

  return useAsyncState(async () => {
    const rollback = await apply()

    try {
      const result = await action()
      if (onSuccess) {
        return await onSuccess(result)
      }
      return result as unknown as R
    }
    catch (err) {
      if (typeof rollback === 'function') {
        await rollback()
      }
      if (onError) {
        await onError(err)
      }
      throw err
    }
  }, { immediate: true })
}
