import type { InferenceServiceProvider } from './types'

import { useDebounceFn } from '@vueuse/core'

type ProviderDraftSource = Partial<Pick<InferenceServiceProvider, 'id' | 'definitionId' | 'config' | 'configuredBy'>>

/** Tracks only provider fields that can change the editable draft. */
export function createProviderDraftSourceKey(provider: ProviderDraftSource | undefined) {
  return JSON.stringify({
    id: provider?.id,
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
  let restoring: Promise<void> | undefined

  return {
    begin(providerId: string, restoreValue: TStatus) {
      active = { providerId, restoreValue }
    },
    clear() {
      active = undefined
    },
    async restore() {
      if (restoring) {
        await restoring
        return
      }

      const pending = active
      if (!pending)
        return

      const operation = Promise.resolve(restoreStatus(pending.providerId, pending.restoreValue))
      restoring = operation
      try {
        await operation
      }
      finally {
        if (active === pending)
          active = undefined
        if (restoring === operation)
          restoring = undefined
      }
    },
  }
}
