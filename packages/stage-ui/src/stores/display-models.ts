import localforage from 'localforage'

import { until } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export enum DisplayModelFormat {
  Live2dDirectory = 'live2d-directory',
  Live2dZip = 'live2d-zip',
  PMD = 'pmd',
  PMXDirectory = 'pmx-directory',
  PMXZip = 'pmx-zip',
  SpineZip = 'spine-zip',
  TachieZip = 'tachie-zip',
  VRM = 'vrm',
}

export type DisplayModel
  = | DisplayModelFile
    | DisplayModelURL

const presetLive2dProUrl = new URL('../assets/live2d/models/hiyori_pro_zh.zip', import.meta.url).href
const presetLive2dFreeUrl = new URL('../assets/live2d/models/hiyori_free_zh.zip', import.meta.url).href
const presetLive2dPreview = new URL('../assets/live2d/models/hiyori/preview.png', import.meta.url).href
const presetVrmAvatarAUrl = new URL('../assets/vrm/models/AvatarSample-A/AvatarSample_A.vrm', import.meta.url).href
const presetVrmAvatarAPreview = new URL('../assets/vrm/models/AvatarSample-A/preview.png', import.meta.url).href
const presetVrmAvatarBUrl = new URL('../assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm', import.meta.url).href
const presetVrmAvatarBPreview = new URL('../assets/vrm/models/AvatarSample-B/preview.png', import.meta.url).href

export interface DisplayModelFile {
  file: File
  format: DisplayModelFormat
  id: string
  importedAt: number
  name: string
  previewImage?: string
  type: 'file'
}

export interface DisplayModelURL {
  format: DisplayModelFormat
  id: string
  importedAt: number
  name: string
  previewImage?: string
  type: 'url'
  url: string
}

const displayModelsPresets: DisplayModel[] = [
  { format: DisplayModelFormat.Live2dZip, id: 'preset-live2d-1', importedAt: 1733113886840, name: 'Hiyori (Pro)', previewImage: presetLive2dPreview, type: 'url', url: presetLive2dProUrl },
  { format: DisplayModelFormat.Live2dZip, id: 'preset-live2d-2', importedAt: 1733113886840, name: 'Hiyori (Free)', previewImage: presetLive2dPreview, type: 'url', url: presetLive2dFreeUrl },
  { format: DisplayModelFormat.VRM, id: 'preset-vrm-1', importedAt: 1733113886840, name: 'AvatarSample_A', previewImage: presetVrmAvatarAPreview, type: 'url', url: presetVrmAvatarAUrl },
  { format: DisplayModelFormat.VRM, id: 'preset-vrm-2', importedAt: 1733113886840, name: 'AvatarSample_B', previewImage: presetVrmAvatarBPreview, type: 'url', url: presetVrmAvatarBUrl },
]

export const useDisplayModelsStore = defineStore('display-models', () => {
  const displayModels = ref<DisplayModel[]>([])

  let generateLive2DPreview: (file: File) => Promise<string | undefined>
  let generateVrmPreview: (file: File) => Promise<string | undefined>
  let generateSpinePreview: (file: File) => Promise<string | undefined>
  let generateTachiePreview: (file: File) => Promise<string | undefined>
  let generateMMDPreview: (file: File) => Promise<string | undefined>

  const displayModelsFromIndexedDBLoading = ref(false)

  async function loadDisplayModelsFromIndexedDB() {
    await until(displayModelsFromIndexedDBLoading).toBe(false)

    displayModelsFromIndexedDBLoading.value = true
    const models = [...displayModelsPresets]

    try {
      await localforage.iterate<{ file: File, format: DisplayModelFormat, importedAt: number, previewImage?: string }, void>((val, key) => {
        if (key.startsWith('display-model-')) {
          models.push({ file: val.file, format: val.format, id: key, importedAt: val.importedAt, name: val.file.name, previewImage: val.previewImage, type: 'file' })
        }
      })
    }
    catch (err) {
      console.error(err)
    }

    displayModels.value = models.sort((a, b) => b.importedAt - a.importedAt)
    displayModelsFromIndexedDBLoading.value = false
  }

  async function getDisplayModel(id: string) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    // NOTICE:
    // Newly imported file models are inserted into displayModels before callers pick them.
    // Reading memory first keeps updateStageModel from racing an IndexedDB write and treating
    // a just-imported display-model id as missing, which used to fall back to the default model.
    // Source/context: model-selector confirmImport/handleAddVRMModel -> model-settings handleModelPick.
    // Removal condition: custom model imports and selection are handled by a single transactional API.
    const modelFromMemory = displayModels.value.find(model => model.id === id)
    if (modelFromMemory)
      return modelFromMemory

    const modelFromFile = await localforage.getItem<DisplayModelFile>(id)
    if (modelFromFile) {
      return modelFromFile
    }

    // Fallback to in-memory presets if not found in localforage
    return displayModelsPresets.find(model => model.id === id)
  }

  const loadLive2DModelPreview = (file: File) => generateLive2DPreview(file)
  const loadVrmModelPreview = (file: File) => generateVrmPreview(file)
  const loadSpineModelPreview = (file: File) => generateSpinePreview(file)
  const loadTachieModelPreview = (file: File) => generateTachiePreview(file)
  const loadMMDModelPreview = (file: File) => generateMMDPreview(file)

  async function addDisplayModel(format: DisplayModelFormat, file: File) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    const newDisplayModel: DisplayModelFile = { file, format, id: `display-model-${nanoid()}`, importedAt: Date.now(), name: file.name, type: 'file' }

    if (format === DisplayModelFormat.Live2dZip) {
      const previewImage = await loadLive2DModelPreview(file)
      newDisplayModel.previewImage = previewImage
    }
    else if (format === DisplayModelFormat.VRM) {
      const previewImage = await loadVrmModelPreview(file)
      newDisplayModel.previewImage = previewImage
    }
    else if (format === DisplayModelFormat.SpineZip) {
      const previewImage = await loadSpineModelPreview(file)
      newDisplayModel.previewImage = previewImage
    }
    else if (format === DisplayModelFormat.TachieZip) {
      const previewImage = await loadTachieModelPreview(file)
      newDisplayModel.previewImage = previewImage
    }
    else if (format === DisplayModelFormat.PMXZip || format === DisplayModelFormat.PMXDirectory || format === DisplayModelFormat.PMD) {
      // NOTICE:
      // Preview generation is best-effort and must not block the import.
      // MMD preview spins up an offscreen WebGL context and the three-stdlib
      // MMDLoader; if that throws (context limits, parse error, missing Ammo
      // module), the model should still import — just without a thumbnail.
      // Removal condition: preview generation is guaranteed non-throwing.
      try {
        if (!generateMMDPreview)
          throw new Error('MMD preview module not initialized')
        newDisplayModel.previewImage = await loadMMDModelPreview(file)
      }
      catch (err) {
        console.error('[display-models] MMD preview generation failed; importing without a thumbnail:', err)
      }
    }

    displayModels.value.unshift(newDisplayModel)

    // NOTICE:
    // Keep this awaited. The settings model pick flow can call getDisplayModel immediately
    // after import; fire-and-forget persistence creates a race where the selected custom model
    // exists in the UI but is not yet readable from IndexedDB in a later route/render pass.
    // Source/context: model-selector import flow -> settings-stage-model.updateStageModel().
    // Removal condition: imported display models are persisted through a transactional queue
    // that blocks pick/navigation until the write is durably complete.
    await localforage.setItem<DisplayModelFile>(newDisplayModel.id, newDisplayModel)
      .catch(err => console.error(err))

    return newDisplayModel
  }

  async function renameDisplayModel(id: string, name: string) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    const displayModel = id.startsWith('display-model-')
      ? await localforage.getItem<DisplayModelFile>(id)
      : displayModels.value.find(m => m.id === id)

    if (!displayModel)
      return

    displayModel.name = name

    // Update reactive state
    const index = displayModels.value.findIndex(m => m.id === id)
    if (index !== -1) {
      displayModels.value[index].name = name
    }

    // Persist if it's a file-based model
    if (id.startsWith('display-model-')) {
      await localforage.setItem(id, displayModel)
    }
  }

  async function removeDisplayModel(id: string) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    await localforage.removeItem(id)
    displayModels.value = displayModels.value.filter(model => model.id !== id)
  }

  async function resetDisplayModels() {
    await loadDisplayModelsFromIndexedDB()
    const userModelIds = displayModels.value.filter(model => model.type === 'file').map(model => model.id)
    for (const id of userModelIds) {
      await removeDisplayModel(id)
    }

    displayModels.value = [...displayModelsPresets].sort((a, b) => b.importedAt - a.importedAt)
  }

  async function initialize() {
    await import('@proj-airi/stage-ui-live2d/utils/live2d-zip-loader')
    await import('@proj-airi/stage-ui-live2d/utils/live2d-opfs-registration')

    const { loadLive2DModelPreview } = await import('@proj-airi/stage-ui-live2d/utils/live2d-preview')
    const { loadVrmModelPreview } = await import('@proj-airi/stage-ui-three/utils/vrm-preview')
    const { loadSpineModelPreview } = await import('@proj-airi/stage-ui-spine/utils/spine-preview')
    const { loadTachieModelPreview } = await import('@proj-airi/stage-ui-tachie/utils/tachie-preview')

    generateLive2DPreview = loadLive2DModelPreview
    generateVrmPreview = loadVrmModelPreview
    generateSpinePreview = loadSpineModelPreview
    generateTachiePreview = loadTachieModelPreview

    // NOTICE:
    // Isolate the MMD preview import. It pulls in three-stdlib's MMD modules,
    // and a module-evaluation failure here must not prevent the Live2D/VRM/
    // Spine preview functions (assigned above) from being wired up. A thrown
    // import previously aborted initialize() and silently broke all previews.
    // Removal condition: the MMD preview module is guaranteed to import.
    try {
      const { loadMMDModelPreview } = await import('@proj-airi/stage-ui-mmd/utils/mmd-preview')
      generateMMDPreview = loadMMDModelPreview
    }
    catch (err) {
      console.error('[display-models] failed to load MMD preview module:', err)
    }
  }

  return {
    addDisplayModel,
    displayModels,

    displayModelsFromIndexedDBLoading,
    getDisplayModel,
    initialize,
    loadDisplayModelsFromIndexedDB,
    removeDisplayModel,
    renameDisplayModel,
    resetDisplayModels,
  }
})
