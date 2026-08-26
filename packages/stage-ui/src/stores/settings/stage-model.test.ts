import type { DisplayModelURL } from '../display-models'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'
import { useSettingsStageModel } from './stage-model'

vi.mock('@proj-airi/stage-shared/composables', async () => {
  const { refManualReset } = await import('@vueuse/core')

  return {
    useLocalStorageManualReset: (_key: string, value: string) => refManualReset(value),
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
  })

  // https://github.com/moeru-ai/airi/issues/1984
  it('issue #1984: falls back to the default preset when a custom stage model is missing', async () => {
    const fallbackModel: DisplayModelURL = {
      format: DisplayModelFormat.Live2dZip,
      id: 'preset-live2d-1',
      importedAt: 1,
      name: 'Preset Live2D',
      type: 'url',
      url: 'https://example.com/preset-live2d.zip',
    }

    const displayModelsStore = useDisplayModelsStore()
    const getDisplayModelSpy = vi.spyOn(displayModelsStore, 'getDisplayModel').mockImplementation(async (id) => {
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
    expect(getDisplayModelSpy).toHaveBeenCalledWith('display-model-missing')
    expect(getDisplayModelSpy).toHaveBeenCalledWith(fallbackModel.id)
  })

  it('routes Tachie archives to the Tachie renderer', async () => {
    const tachieModel: DisplayModelURL = {
      format: DisplayModelFormat.TachieZip,
      id: 'tachie-model',
      importedAt: 1,
      name: 'Tachie character',
      type: 'url',
      url: 'https://example.com/character.tachie.zip',
    }
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue(tachieModel)

    const store = useSettingsStageModel()
    store.stageModelSelected = tachieModel.id

    await store.initializeStageModel()

    expect(store.stageModelSelectedDisplayModel).toEqual(tachieModel)
    expect(store.stageModelSelectedUrl).toBe(tachieModel.url)
    expect(store.stageModelRenderer).toBe('tachie')
  })
})
