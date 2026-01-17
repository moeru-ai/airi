import { useAsyncState } from './use-async-state'

export interface UseOptimisticMutationOptions<T, R, E = unknown> {
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
  onError?: (error?: E | null) => void | Promise<void>

  /**
   * Whether to execute the action lazily.
   */
  lazy?: boolean
}

/**
 * A wrapper for performing optimistic mutations with automatic rollback.
 * Integrates with useAsyncState for loading/error tracking.
 * TODO: use https://pinia-colada.esm.dev/guide/mutations.html instead.
 */
export function useOptimisticMutation<T, R = T, E = unknown>(options: UseOptimisticMutationOptions<T, R, E>) {
  const { apply, action, onSuccess, onError, lazy = false } = options

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
        await onError(err as E)
      }
      throw err
    }
  }, { immediate: !lazy })
}
