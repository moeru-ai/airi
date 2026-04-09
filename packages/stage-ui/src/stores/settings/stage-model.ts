import type { DisplayModel } from '../display-models'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { cleanupMmdZipData, loadMmdFromZip } from '@proj-airi/stage-ui-live2d/utils/mmd-zip-loader'
import { registerMmdTextures as registerMmdTexturesForLoader } from '@proj-airi/stage-ui-three/composables/mmd/loader'
import { refManualReset, useEventListener } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'

export type StageModelRenderer = 'live2d' | 'vrm' | 'mmd' | 'disabled' | undefined

export const useSettingsStageModel = defineStore('settings-stage-model', () => {
  const displayModelsStore = useDisplayModelsStore()
  let stageModelUpdateSequence = 0
  const stageModelStorageKey = 'settings/stage/model'

  const stageModelSelectedState = useLocalStorageManualReset<string>(stageModelStorageKey, 'preset-live2d-1')
  const stageModelSelected = computed<string>({
    get: () => stageModelSelectedState.value,
    set: (value) => {
      stageModelSelectedState.value = value
    },
  })
  const stageModelSelectedDisplayModel = refManualReset<DisplayModel | undefined>(undefined)
  const stageModelSelectedUrl = refManualReset<string | undefined>(undefined)
  const stageModelSelectedVmdUrl = refManualReset<string | undefined>(undefined)
  const stageModelRenderer = refManualReset<StageModelRenderer>(undefined)

  // Store extracted MMD data for cleanup
  let currentMmdZipData: ReturnType<typeof loadMmdFromZip> extends Promise<infer T> ? T : never

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

  function revokeStageModelVmdUrl(url?: string) {
    if (url?.startsWith('blob:'))
      URL.revokeObjectURL(url)
  }

  function replaceStageModelVmdUrl(nextUrl?: string) {
    if (stageModelSelectedVmdUrl.value === nextUrl)
      return

    revokeStageModelVmdUrl(stageModelSelectedVmdUrl.value)
    stageModelSelectedVmdUrl.value = nextUrl
  }

  async function updateStageModel() {
    const requestId = ++stageModelUpdateSequence
    const selectedModelId = stageModelSelectedState.value

    if (!selectedModelId) {
      replaceStageModelUrl(undefined)
      replaceStageModelVmdUrl(undefined)
      stageModelSelectedDisplayModel.value = undefined
      stageModelRenderer.value = 'disabled'
      return
    }

    const model = await displayModelsStore.getDisplayModel(selectedModelId)
    if (requestId !== stageModelUpdateSequence)
      return

    if (!model) {
      replaceStageModelUrl(undefined)
      replaceStageModelVmdUrl(undefined)
      stageModelSelectedDisplayModel.value = undefined
      stageModelRenderer.value = 'disabled'
      return
    }

    switch (model.format) {
      case DisplayModelFormat.Live2dZip:
        stageModelRenderer.value = 'live2d'
        break
      case DisplayModelFormat.VRM:
        stageModelRenderer.value = 'vrm'
        break
      case DisplayModelFormat.PMXZip:
      case DisplayModelFormat.PMXDirectory:
      case DisplayModelFormat.PMD:
        stageModelRenderer.value = 'mmd'
        break
      default:
        stageModelRenderer.value = 'disabled'
        break
    }

    if (model.type === 'file') {
      // Handle PMXZip - need to extract the ZIP first
      if (model.format === DisplayModelFormat.PMXZip) {
        // Clean up previous MMD ZIP data
        if (currentMmdZipData) {
          cleanupMmdZipData(currentMmdZipData)
          currentMmdZipData = undefined
        }

        const mmdData = await loadMmdFromZip(model.file)
        if (requestId !== stageModelUpdateSequence) {
          // Cleanup if request was superseded
          cleanupMmdZipData(mmdData)
          return
        }

        currentMmdZipData = mmdData

        // Register textures for MMD loader to resolve
        registerMmdTexturesForLoader(mmdData.textures)

        replaceStageModelUrl(mmdData.modelUrl)
        replaceStageModelVmdUrl(mmdData.vmdUrl)
      }
      else {
        const nextUrl = URL.createObjectURL(model.file)
        if (requestId !== stageModelUpdateSequence) {
          URL.revokeObjectURL(nextUrl)
          return
        }

        replaceStageModelUrl(nextUrl)
        replaceStageModelVmdUrl(undefined)
      }
    }
    else {
      replaceStageModelUrl(model.url)
      replaceStageModelVmdUrl(undefined)
    }

    stageModelSelectedDisplayModel.value = model
  }

  async function initializeStageModel() {
    await updateStageModel()
  }

  useEventListener('unload', () => {
    revokeStageModelUrl(stageModelSelectedUrl.value)
    revokeStageModelVmdUrl(stageModelSelectedVmdUrl.value)
    if (currentMmdZipData) {
      cleanupMmdZipData(currentMmdZipData)
      currentMmdZipData = undefined
    }
  })

  watch(stageModelSelectedState, (_newValue, _oldValue) => {
    void updateStageModel()
  })

  async function resetState() {
    revokeStageModelUrl(stageModelSelectedUrl.value)
    revokeStageModelVmdUrl(stageModelSelectedVmdUrl.value)

    if (currentMmdZipData) {
      cleanupMmdZipData(currentMmdZipData)
      currentMmdZipData = undefined
    }

    stageModelSelectedState.reset()
    stageModelSelectedDisplayModel.reset()
    stageModelSelectedUrl.reset()
    stageModelSelectedVmdUrl.reset()
    stageModelRenderer.reset()
    stageViewControlsEnabled.reset()

    await updateStageModel()
  }

  return {
    stageModelRenderer,
    stageModelSelected,
    stageModelSelectedUrl,
    stageModelSelectedVmdUrl,
    stageModelSelectedDisplayModel,
    stageViewControlsEnabled,

    initializeStageModel,
    updateStageModel,
    resetState,
  }
})
