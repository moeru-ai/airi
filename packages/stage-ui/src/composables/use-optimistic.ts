import { useAsyncState } from './use-async-state'

export interface UseOptimisticMutationOptions<T, R, E = unknown> {
  /**
   * The actual async task (e.g., API call).
   */
  action: () => Promise<T>
  /**
   * The optimistic update logic.
   * Should return a rollback function.
   */
  apply: () => (() => Promise<void> | void) | Promise<(() => Promise<void> | void)>
  /**
   * Whether to execute the action lazily.
   */
  lazy?: boolean
  /**
   * Optional callback on error. Rollback is handled automatically.
   */
  onError?: (error?: E | null) => Promise<void> | void
  /**
   * Optional callback after successful action to refine state (e.g., replacing temp IDs).
   */
  onSuccess?: (result: T) => Promise<R> | R
  /**
   * Decide whether to rollback after an error.
   */
  shouldRollback?: (error: E) => boolean | Promise<boolean>

  /**
   * Skip the action when this returns true.
   */
  skipActionIf?: () => boolean | Promise<boolean>
}

/**
 * A wrapper for performing optimistic mutations with automatic rollback.
 * Integrates with useAsyncState for loading/error tracking.
 * TODO: use https://pinia-colada.esm.dev/guide/mutations.html instead.
 */
export function useOptimisticMutation<T, R = T, E = unknown>(options: UseOptimisticMutationOptions<T, R, E>) {
  const {
    action,
    apply,
    lazy = false,
    onError,
    onSuccess,
    shouldRollback,
    skipActionIf,
  } = options

  return useAsyncState(async () => {
    if (skipActionIf && await skipActionIf()) {
      return undefined as R
    }

    const rollback = await apply()

    try {
      const result = await action()
      if (onSuccess) {
        return await onSuccess(result)
      }
      return result as unknown as R
    }
    catch (err) {
      const allowRollback = shouldRollback ? await shouldRollback(err as E) : true
      if (allowRollback && typeof rollback === 'function') {
        await rollback()
      }
      if (onError) {
        await onError(err as E)
      }
      throw err
    }
  }, { immediate: !lazy })
}
