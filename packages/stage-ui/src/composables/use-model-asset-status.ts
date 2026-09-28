import type { ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'

import { computed, reactive } from 'vue'

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
