import type { DisplayModelURL } from '../display-models'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'
import { useSettingsStageModel } from './stage-model'

const { initialStageModelId, resetLegacyModelIdentity } = vi.hoisted(() => ({
  initialStageModelId: { value: 'preset-live2d-1' },
  resetLegacyModelIdentity: vi.fn(),
}))

vi.mock('@proj-airi/stage-ui-three', () => ({
  useModelStore: () => ({ resetLegacyModelIdentity }),
}))

vi.mock('@proj-airi/stage-shared/composables', async () => {
  const { refManualReset } = await import('@vueuse/core')

  return {
    useLocalStorageManualReset: (key: string, value: string) => refManualReset(
      key === 'settings/stage/model' ? initialStageModelId.value : value,
    ),
  }
})

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return {
    ...actual,
    useEventListener: vi.fn(),
  }
})

describe('settings stage model store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    initialStageModelId.value = 'preset-live2d-1'
    resetLegacyModelIdentity.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // https://github.com/moeru-ai/airi/issues/1984
  it('issue #1984: falls back to the default preset when a custom stage model is missing', async () => {
    const fallbackModel: DisplayModelURL = {
      id: 'preset-live2d-1',
      format: DisplayModelFormat.Live2dZip,
      type: 'url',
      url: 'https://example.com/preset-live2d.zip',
      name: 'Preset Live2D',
      importedAt: 1,
    }

    const displayModelsStore = useDisplayModelsStore()
    const ensureDisplayModelSpy = vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockImplementation(async (id) => {
      if (id === 'display-model-missing')
        return undefined
      if (id === fallbackModel.id)
        return fallbackModel
      return undefined
    })

    const store = useSettingsStageModel()
    store.stageModelSelected = 'display-model-missing'

    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe(fallbackModel.id)
    expect(store.stageModelSelectedDisplayModel).toEqual(fallbackModel)
    expect(store.stageModelSelectedUrl).toBe(fallbackModel.url)
    expect(store.stageModelRenderer).toBe('live2d')
    expect(ensureDisplayModelSpy).toHaveBeenCalledWith('display-model-missing')
    expect(ensureDisplayModelSpy).toHaveBeenCalledWith(fallbackModel.id)
    expect(resetLegacyModelIdentity).not.toHaveBeenCalled()
  })

  it('keeps a cloud model selected when its download fails', async () => {
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const store = useSettingsStageModel()
    store.stageModelSelected = 'display-model-cloud'

    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe('display-model-cloud')
  })

  it('routes Tachie archives to the Tachie renderer', async () => {
    const tachieModel: DisplayModelURL = {
      id: 'tachie-model',
      format: DisplayModelFormat.TachieZip,
      type: 'url',
      url: 'https://example.com/character.tachie.zip',
      name: 'Tachie character',
      importedAt: 1,
    }
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockResolvedValue(tachieModel)

    vi.stubGlobal('window', {})
    initialStageModelId.value = tachieModel.id
    const store = useSettingsStageModel()

    await store.initializeStageModel()

    expect(store.stageModelSelectedDisplayModel).toEqual(tachieModel)
    expect(store.stageModelSelectedUrl).toBe(tachieModel.url)
    expect(store.stageModelRenderer).toBe('tachie')
    expect(resetLegacyModelIdentity).toHaveBeenCalledOnce()
    expect(resetLegacyModelIdentity).toHaveBeenCalledWith()
  })

  it('resets the legacy model identity before publishing the startup model', async () => {
    const vrmModel: DisplayModelURL = {
      id: 'vrm-model',
      format: DisplayModelFormat.VRM,
      type: 'url',
      url: 'https://example.com/character.vrm',
      name: 'VRM character',
      importedAt: 1,
    }
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockResolvedValue(vrmModel)

    vi.stubGlobal('window', {})
    initialStageModelId.value = vrmModel.id
    const store = useSettingsStageModel()

    resetLegacyModelIdentity.mockImplementationOnce(() => {
      expect(store.stageModelRenderer).toBeUndefined()
      expect(store.stageModelSelectedUrl).toBeUndefined()
    })

    await store.initializeStageModel()

    expect(resetLegacyModelIdentity).toHaveBeenCalledWith()
    expect(store.stageModelRenderer).toBe('vrm')
    expect(store.stageModelSelectedUrl).toBe(vrmModel.url)
  })
})
