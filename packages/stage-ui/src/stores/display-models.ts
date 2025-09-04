import cropImg from '@lemonneko/crop-empty-pixels'
import localforage from 'localforage'

import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { until } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { Live2DFactory, Live2DModel } from 'pixi-live2d-display/cubism4'
import { ref } from 'vue'

import '../utils/live2d-zip-loader'

export enum DisplayModelFormat {
  Live2dZip = 'live2d-zip',
  Live2dDirectory = 'live2d-directory',
  VRM = 'vrm',
  PMXZip = 'pmx-zip',
  PMXDirectory = 'pmx-directory',
  PMD = 'pmd',
}

export type DisplayModel
  = | DisplayModelFile
    | DisplayModelURL

export interface DisplayModelFile {
  id: string
  format: DisplayModelFormat
  type: 'file'
  file: File
  name: string
  previewImage?: string
  importedAt: number
}

export interface DisplayModelURL {
  id: string
  format: DisplayModelFormat
  type: 'url'
  url: string
  name: string
  previewImage?: string
  importedAt: number
}

const displayModelsPresets: DisplayModel[] = [
  { id: 'preset-live2d-1', format: DisplayModelFormat.Live2dZip, type: 'url', url: '/assets/live2d/models/hiyori_pro_zh.zip', name: 'Hiyori (Pro)', previewImage: '/assets/live2d/models/hiyori/preview.png', importedAt: 1733113886840 },
  { id: 'preset-live2d-2', format: DisplayModelFormat.Live2dZip, type: 'url', url: '/assets/live2d/models/hiyori_free_zh.zip', name: 'Hiyori (Free)', previewImage: '/assets/live2d/models/hiyori/preview.png', importedAt: 1733113886840 },
  { id: 'preset-vrm-1', format: DisplayModelFormat.VRM, type: 'url', url: '/assets/vrm/models/AvatarSample-A/AvatarSample_A.vrm', name: 'AvatarSample_A', previewImage: '/assets/vrm/models/AvatarSample-A/preview.png', importedAt: 1733113886840 },
  { id: 'preset-vrm-2', format: DisplayModelFormat.VRM, type: 'url', url: '/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm', name: 'AvatarSample_B', previewImage: '/assets/vrm/models/AvatarSample-B/preview.png', importedAt: 1733113886840 },
]

export const useDisplayModelsStore = defineStore('display-models', () => {
  const displayModels = ref<DisplayModel[]>([])

  const displayModelsFromIndexedDBLoading = ref(false)

  async function loadDisplayModelsFromIndexedDB() {
    await until(displayModelsFromIndexedDBLoading).toBe(false)

    displayModelsFromIndexedDBLoading.value = true
    const models = [...displayModelsPresets]

    try {
      await localforage.iterate<{ format: DisplayModelFormat, file: File, importedAt: number, previewImage?: string }, void>((val, key) => {
        if (key.startsWith('display-model-')) {
          models.push({ id: key, format: val.format, type: 'file', file: val.file, name: val.file.name, importedAt: val.importedAt, previewImage: val.previewImage })
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
    const modelFromFile = await localforage.getItem<DisplayModelFile>(id)
    if (modelFromFile) {
      return modelFromFile
    }

    // Fallback to in-memory presets if not found in localforage
    return displayModelsPresets.find(model => model.id === id)
  }

  async function loadLive2DModelPreview(file: File) {
    Live2DModel.registerTicker(Ticker)
    extensions.add(TickerPlugin)

    const offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = 720
    offscreenCanvas.height = 1280
    offscreenCanvas.style.position = 'absolute'
    offscreenCanvas.style.top = '0'
    offscreenCanvas.style.left = '0'
    offscreenCanvas.style.objectFit = 'cover'
    offscreenCanvas.style.display = 'block'
    offscreenCanvas.style.zIndex = '10000000000'
    offscreenCanvas.style.opacity = '0'
    document.body.appendChild(offscreenCanvas)

    const app = new Application({
      view: offscreenCanvas,
      // Ensure the drawing buffer persists so toDataURL() can read pixels
      preserveDrawingBuffer: true,
      backgroundAlpha: 0,
      resizeTo: window,
    })

    const modelInstance = new Live2DModel()
    const objUrl = URL.createObjectURL(file)
    const res = await fetch(objUrl)
    const blob = await res.blob()

    try {
      await Live2DFactory.setupLive2DModel(modelInstance, [new File([blob], file.name)], { autoInteract: false })
    }
    catch (error) {
      app.destroy()
      document.body.removeChild(offscreenCanvas)
      URL.revokeObjectURL(objUrl)
      console.error(error)
      return
    }

    app.stage.addChild(modelInstance)

    // transforms
    modelInstance.x = 275
    modelInstance.y = 450
    modelInstance.width = offscreenCanvas.width
    modelInstance.height = offscreenCanvas.height
    modelInstance.scale.set(0.1, 0.1)
    modelInstance.anchor.set(0.5, 0.5)

    await new Promise(resolve => setTimeout(resolve, 500))
    // Force a render to ensure the latest frame is in the drawing buffer
    app.renderer.render(app.stage)

    const croppedCanvas = cropImg(offscreenCanvas)
    const dataUrl = croppedCanvas.toDataURL()

    app.destroy()
    document.body.removeChild(offscreenCanvas)
    URL.revokeObjectURL(objUrl)

    // return dataUrl
    return dataUrl
  }

  async function addDisplayModel(format: DisplayModelFormat, file: File) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    const newDisplayModel: DisplayModelFile = { id: `display-model-${nanoid()}`, format, type: 'file', file, name: file.name, importedAt: Date.now() }

    if (format === DisplayModelFormat.Live2dZip) {
      const previewImage = await loadLive2DModelPreview(file)
      if (!previewImage)
        return

      newDisplayModel.previewImage = previewImage
    }

    displayModels.value.unshift(newDisplayModel)

    localforage.setItem<DisplayModelFile>(newDisplayModel.id, newDisplayModel)
      .catch(err => console.error(err))
  }

  async function renameDisplayModel(id: string, name: string) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    const displayModel = await localforage.getItem<DisplayModelFile>(id)
    if (!displayModel)
      return

    displayModel.name = name
  }

  async function removeDisplayModel(id: string) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    await localforage.removeItem(id)
    displayModels.value = displayModels.value.filter(model => model.id !== id)
  }

  return {
    displayModels,
    displayModelsFromIndexedDBLoading,

    loadDisplayModelsFromIndexedDB,
    getDisplayModel,
    addDisplayModel,
    renameDisplayModel,
    removeDisplayModel,
  }
})
