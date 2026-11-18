import type { DisplayModelURL } from '../display-models'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

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
    const ensureDisplayModelSpy = vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockResolvedValue(undefined)

    const store = useSettingsStageModel()
    store.stageModelSelected = 'display-model-missing'

    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe('display-model-missing')
    expect(store.stageModelSelectedDisplayModel).toBeUndefined()
    expect(store.stageModelSelectedUrl).toBeUndefined()
    expect(store.stageModelRenderer).toBe('disabled')
    expect(store.stageModelUnavailable).toBe(true)
    expect(ensureDisplayModelSpy).toHaveBeenCalledWith('display-model-missing')
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
    // The model still exists in the account, so the Stage does not ask for another model.
    expect(store.stageModelUnavailable).toBe(false)
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
    vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockResolvedValue(vrmModel)

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

  // ROOT CAUSE:
  //
  // A pick writes the selection and then calls updateStageModel(). The selection
  // watcher also calls updateStageModel(), so each pick resolved the model twice.
  // The newer call made the first load stop, but only after its resolve finished.
  //
  // We fixed this by sharing the running load of the same selection.
  it('resolves a picked model once when the watcher and the picker both request the load', async () => {
    const vrmModel: DisplayModelURL = {
      id: 'vrm-model',
      format: DisplayModelFormat.VRM,
      type: 'url',
      url: 'https://example.com/character.vrm',
      name: 'VRM character',
      importedAt: 1,
    }
    const displayModelsStore = useDisplayModelsStore()
    const ensureDisplayModelSpy = vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable').mockResolvedValue(vrmModel)

    const store = useSettingsStageModel()
    store.stageModelSelected = vrmModel.id
    await store.updateStageModel()
    await nextTick()

    expect(ensureDisplayModelSpy).toHaveBeenCalledOnce()
    expect(store.stageModelSelectedUrl).toBe(vrmModel.url)
  })

  it('loads a new pick while the previous pick still loads', async () => {
    const models: DisplayModelURL[] = ['vrm-a', 'vrm-b'].map(id => ({
      id,
      format: DisplayModelFormat.VRM,
      type: 'url',
      url: `https://example.com/${id}.vrm`,
      name: id,
      importedAt: 1,
    }))
    let releaseFirst!: () => void
    const displayModelsStore = useDisplayModelsStore()
    const ensureDisplayModelSpy = vi.spyOn(displayModelsStore, 'ensureDisplayModelAvailable')
      .mockImplementationOnce(() => new Promise(resolve => releaseFirst = () => resolve(models[0])))
      .mockResolvedValueOnce(models[1])

    const store = useSettingsStageModel()
    store.stageModelSelected = models[0].id
    const firstLoad = store.updateStageModel()
    store.stageModelSelected = models[1].id
    await store.updateStageModel()
    releaseFirst()
    await firstLoad
    await nextTick()

    expect(ensureDisplayModelSpy).toHaveBeenCalledTimes(2)
    expect(ensureDisplayModelSpy).toHaveBeenNthCalledWith(1, models[0].id)
    expect(ensureDisplayModelSpy).toHaveBeenNthCalledWith(2, models[1].id)
    // The first load finishes last, but the newer pick stays on the Stage.
    expect(store.stageModelSelectedUrl).toBe(models[1].url)
  })
})
