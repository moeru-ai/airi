import type { ModelAssetFailure, ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'

import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

const statuses = reactive(new Map<string, ModelAssetStatus>())

/** Applies storage status from the local repository or Electron main process. */
export function updateModelAssetStatus(status: ModelAssetStatus): void {
  statuses.set(status.id, status)
}

export function useModelAssetStatus() {
  const models = computed(() => [...statuses.values()])
  const active = computed(() => models.value.filter(model => model.state === 'downloading' || model.state === 'error'))
  return { models, active }
}

/** Translates a model install failure into a sentence that tells the user what went wrong. */
export function useModelAssetFailureMessage() {
  const { t } = useI18n()
  return (failure: ModelAssetFailure): string => {
    switch (failure.reason) {
      case 'network':
        return t('stage.model-assets.errors.network', { host: failure.host })
      case 'server':
        return t('stage.model-assets.errors.server', { host: failure.host, status: failure.status })
      case 'incomplete':
        return t('stage.model-assets.errors.incomplete', { host: failure.host })
      case 'unknown':
        return t('stage.model-assets.errors.unknown', { error: failure.message })
    }
  }
}
