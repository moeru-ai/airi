import type { DisplayModel } from '../display-models'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset, useEventListener } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'

export type StageModelRenderer = 'live2d' | 'vrm' | 'disabled' | undefined

const defaultStageModelId = 'preset-live2d-1'
const stageModelFallbackOrder = [
  'preset-live2d-2',
  'preset-live2d-1',
  'preset-vrm-1',
  'preset-vrm-2',
]

export const useSettingsStageModel = defineStore('settings-stage-model', () => {
  const displayModelsStore = useDisplayModelsStore()
  let stageModelUpdateSequence = 0
  const stageModelStorageKey = 'settings/stage/model'
  const presetAvailabilityCache = new Map<string, boolean>()

  const stageModelSelectedState = useLocalStorageManualReset<string>(stageModelStorageKey, defaultStageModelId)
  const stageModelSelected = computed<string>({
    get: () => stageModelSelectedState.value,
    set: (value) => {
      stageModelSelectedState.value = value
    },
  })
  const stageModelSelectedDisplayModel = refManualReset<DisplayModel | undefined>(undefined)
  const stageModelSelectedUrl = refManualReset<string | undefined>(undefined)
  const stageModelRenderer = refManualReset<StageModelRenderer>(undefined)

  const stageViewControlsEnabled = refManualReset<boolean>(false)

  function revokeStageModelUrl(url?: string) {
    if (url?.startsWith('blob:'))
      URL.revokeObjectURL(url)
  }

  function replaceStageModelUrl(nextUrl?: string) {
    if (stageModelSelectedUrl.value === nextUrl)
      return

    revokeStageModelUrl(stageModelSelectedUrl.value)
    stageModelSelectedUrl.value = nextUrl
  }

  function clearStageModelSelection() {
    replaceStageModelUrl(undefined)
    stageModelSelectedDisplayModel.value = undefined
    stageModelRenderer.value = 'disabled'
  }

  async function isPresetModelAvailable(model: DisplayModel) {
    if (model.type !== 'url') {
      return true
    }

    if (!model.id.startsWith('preset-')) {
      return true
    }

    const cached = presetAvailabilityCache.get(model.id)
    if (cached !== undefined) {
      return cached
    }

    try {
      const response = await fetch(model.url, {
        method: 'HEAD',
        cache: 'no-store',
      })
      presetAvailabilityCache.set(model.id, response.ok)
      return response.ok
    }
    catch {
      presetAvailabilityCache.set(model.id, false)
      return false
    }
  }

  async function resolveStageModel(preferredModelId: string, excludedIds: string[] = []) {
    const candidateIds = [...new Set([
      preferredModelId,
      ...stageModelFallbackOrder,
    ])].filter((modelId): modelId is string => Boolean(modelId) && !excludedIds.includes(modelId))

    for (const modelId of candidateIds) {
      const model = await displayModelsStore.getDisplayModel(modelId)
      if (!model) {
        continue
      }

      if (await isPresetModelAvailable(model)) {
        return {
          modelId,
          model,
        }
      }
    }

    return undefined
  }

  function applyStageModel(model: DisplayModel, requestId: number) {
    switch (model.format) {
      case DisplayModelFormat.Live2dZip:
        stageModelRenderer.value = 'live2d'
        break
      case DisplayModelFormat.VRM:
        stageModelRenderer.value = 'vrm'
        break
      default:
        stageModelRenderer.value = 'disabled'
        break
    }

    if (model.type === 'file') {
      const nextUrl = URL.createObjectURL(model.file)
      if (requestId !== stageModelUpdateSequence) {
        URL.revokeObjectURL(nextUrl)
        return
      }

      replaceStageModelUrl(nextUrl)
    }
    else {
      replaceStageModelUrl(model.url)
    }

    stageModelSelectedDisplayModel.value = model
  }

  async function updateStageModel() {
    const requestId = ++stageModelUpdateSequence
    const selectedModelId = stageModelSelectedState.value

    if (!selectedModelId) {
      clearStageModelSelection()
      return
    }

    const resolved = await resolveStageModel(selectedModelId)
    if (requestId !== stageModelUpdateSequence)
      return

    if (!resolved) {
      clearStageModelSelection()
      return
    }

    if (resolved.modelId !== selectedModelId) {
      stageModelSelectedState.value = resolved.modelId
    }

    applyStageModel(resolved.model, requestId)
  }

  async function initializeStageModel() {
    await updateStageModel()
  }

  async function fallbackStageModel(failedModelId = stageModelSelectedState.value) {
    const requestId = ++stageModelUpdateSequence
    const preferredModelId = stageModelSelectedState.value || defaultStageModelId
    const resolved = await resolveStageModel(preferredModelId, failedModelId ? [failedModelId] : [])

    if (requestId !== stageModelUpdateSequence) {
      return undefined
    }

    if (!resolved) {
      clearStageModelSelection()
      return undefined
    }

    if (resolved.modelId !== stageModelSelectedState.value) {
      stageModelSelectedState.value = resolved.modelId
    }

    applyStageModel(resolved.model, requestId)
    return resolved.modelId
  }

  useEventListener('unload', () => {
    revokeStageModelUrl(stageModelSelectedUrl.value)
  })

  watch(stageModelSelectedState, (_newValue, _oldValue) => {
    void updateStageModel()
  })

  async function resetState() {
    revokeStageModelUrl(stageModelSelectedUrl.value)

    stageModelSelectedState.reset()
    stageModelSelectedDisplayModel.reset()
    stageModelSelectedUrl.reset()
    stageModelRenderer.reset()
    stageViewControlsEnabled.reset()

    await updateStageModel()
  }

  return {
    stageModelRenderer,
    stageModelSelected,
    stageModelSelectedUrl,
    stageModelSelectedDisplayModel,
    stageViewControlsEnabled,

    initializeStageModel,
    updateStageModel,
    fallbackStageModel,
    resetState,
  }
})
