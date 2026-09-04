import type { InferenceServiceProvider } from './types'

import { useDebounceFn } from '@vueuse/core'

type ProviderDraftSource = Partial<Pick<InferenceServiceProvider, 'definitionId' | 'config' | 'configuredBy'>>

/** Tracks only provider fields that can change the editable draft. */
export function createProviderDraftSourceKey(provider: ProviderDraftSource | undefined) {
  return JSON.stringify({
    definitionId: provider?.definitionId,
    config: provider?.config,
    configuredBy: provider?.configuredBy,
  })
}

/** Keeps asynchronous provider validations from committing stale draft results. */
export function createLatestValidationGuard() {
  let currentRun = 0

  return {
    begin() {
      const run = ++currentRun
      return () => run === currentRun
    },
    invalidate() {
      currentRun++
    },
  }
}

/** Skips the initial watcher pass while still arming later draft validation. */
export function createProviderValidationScheduleGate() {
  let initialized = false

  return (canSkipValidation: boolean) => {
    if (!initialized) {
      initialized = true
      return false
    }
    return !canSkipValidation
  }
}

/** Creates lifecycle-aware debounced validation work for a provider editor. */
export function createDebouncedValidationRunner(validate: () => void | Promise<void>, delay: number) {
  const run = useDebounceFn(validate, delay)
  return { run, cancel: run.cancel }
}

/** Restores the persisted status when an active validation is canceled. */
export function createValidationStatusRestorer<TStatus>(
  restoreStatus: (providerId: string, restoreValue: TStatus) => void | Promise<void>,
) {
  let active: { providerId: string, restoreValue: TStatus } | undefined
  let restorationQueue = Promise.resolve()

  return {
    begin(providerId: string, restoreValue: TStatus) {
      active = { providerId, restoreValue }
    },
    clear(expectedRestoreValue?: TStatus) {
      if (expectedRestoreValue === undefined || Object.is(active?.restoreValue, expectedRestoreValue))
        active = undefined
    },
    async restore(expectedRestoreValue?: TStatus) {
      const operation = restorationQueue.then(async () => {
        const pending = active
        if (!pending || (expectedRestoreValue !== undefined && !Object.is(pending.restoreValue, expectedRestoreValue)))
          return

        try {
          await restoreStatus(pending.providerId, pending.restoreValue)
        }
        finally {
          if (active === pending)
            active = undefined
        }
      })
      restorationQueue = operation.catch(() => {})
      await operation
    },
  }
}
