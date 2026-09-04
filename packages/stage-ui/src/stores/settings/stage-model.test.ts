import type { DisplayModelURL } from '../display-models'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'
import { useSettingsStageModel } from './stage-model'

const { resetLegacyModelIdentity } = vi.hoisted(() => ({
  resetLegacyModelIdentity: vi.fn(),
}))

vi.mock('@proj-airi/stage-ui-three', () => ({
  useModelStore: () => ({ resetLegacyModelIdentity }),
}))

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
    resetLegacyModelIdentity.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ROOT CAUSE:
  //
  // The runtime replaced a missing Display Model with a preset. The selected
  // Avatar Model still referenced the missing resource, so Character state and
  // renderer state described different models.
  //
  // We fixed this by keeping the resource identity and disabling the renderer.
  it('disables the renderer when the selected Avatar Model resource is missing', async () => {
    const displayModelsStore = useDisplayModelsStore()
    const getDisplayModelSpy = vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue(undefined)

    const store = useSettingsStageModel()
    store.stageModelSelected = 'display-model-missing'

    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe('display-model-missing')
    expect(store.stageModelSelectedDisplayModel).toBeUndefined()
    expect(store.stageModelSelectedUrl).toBeUndefined()
    expect(store.stageModelRenderer).toBe('disabled')
    expect(getDisplayModelSpy).toHaveBeenCalledWith('display-model-missing')
    expect(resetLegacyModelIdentity).not.toHaveBeenCalled()
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
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue(tachieModel)

    vi.stubGlobal('window', {})
    const store = useSettingsStageModel()
    store.stageModelSelected = tachieModel.id

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
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue(vrmModel)

    vi.stubGlobal('window', {})
    const store = useSettingsStageModel()

    resetLegacyModelIdentity.mockImplementationOnce(() => {
      expect(store.stageModelRenderer).toBeUndefined()
      expect(store.stageModelSelectedUrl).toBeUndefined()
    })
    store.stageModelSelected = vrmModel.id

    await store.initializeStageModel()

    expect(resetLegacyModelIdentity).toHaveBeenCalledWith()
    expect(store.stageModelRenderer).toBe('vrm')
    expect(store.stageModelSelectedUrl).toBe(vrmModel.url)
  })
})
