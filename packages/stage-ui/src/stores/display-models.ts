import type { VRM } from '@pixiv/three-vrm'

import cropImg from '@lemonneko/crop-empty-pixels'
import localforage from 'localforage'

import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { clipFromVRMAnimation, loadVrm, loadVRMAnimation, reAnchorRootPositionTrack } from '@proj-airi/stage-ui-three/composables/vrm'
import { until } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { Live2DFactory, Live2DModel } from 'pixi-live2d-display/cubism4'
import { AmbientLight, AnimationMixer, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { ref } from 'vue'

import '../utils/live2d-zip-loader'
import '../utils/live2d-opfs-registration'

export enum DisplayModelFormat {
  Live2dZip = 'live2d-zip',
  Live2dDirectory = 'live2d-directory',
  VRM = 'vrm',
  PMXZip = 'pmx-zip',
  PMXDirectory = 'pmx-directory',
  PMD = 'pmd',
  PNGtuber = 'pngtuber',
}

// PNGtuber manifest structure for defining sprite states
export interface PNGtuberManifest {
  version: 1
  name: string
  // Base images for idle state
  idle: {
    default: string
    blink?: string
  }
  // Mouth shapes for lip sync (optional - if not provided, uses open/closed)
  mouth?: {
    closed: string
    open: string
    // Vowel-specific mouth shapes (optional)
    a?: string
    e?: string
    i?: string
    o?: string
    u?: string
  }
  // Emotion overlays or full replacements (optional)
  emotions?: {
    [emotionName: string]: {
      default: string
      blink?: string
    }
  }
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
  { id: 'preset-live2d-1', format: DisplayModelFormat.Live2dZip, type: 'url', url: presetLive2dProUrl, name: 'Hiyori (Pro)', previewImage: presetLive2dPreview, importedAt: 1733113886840 },
  { id: 'preset-live2d-2', format: DisplayModelFormat.Live2dZip, type: 'url', url: presetLive2dFreeUrl, name: 'Hiyori (Free)', previewImage: presetLive2dPreview, importedAt: 1733113886840 },
  { id: 'preset-vrm-1', format: DisplayModelFormat.VRM, type: 'url', url: presetVrmAvatarAUrl, name: 'AvatarSample_A', previewImage: presetVrmAvatarAPreview, importedAt: 1733113886840 },
  { id: 'preset-vrm-2', format: DisplayModelFormat.VRM, type: 'url', url: presetVrmAvatarBUrl, name: 'AvatarSample_B', previewImage: presetVrmAvatarBPreview, importedAt: 1733113886840 },
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

    const previewWidth = 1440
    const previewHeight = 2560
    const previewResolution = 2

    const offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = previewWidth * previewResolution
    offscreenCanvas.height = previewHeight * previewResolution
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
      width: offscreenCanvas.width,
      height: offscreenCanvas.height,
      // Ensure the drawing buffer persists so toDataURL() can read pixels
      preserveDrawingBuffer: true,
      backgroundAlpha: 0,
      autoDensity: false,
      resolution: 1,
      autoStart: false,
    })
    app.stage.scale.set(previewResolution)
    app.ticker.stop()

    const modelInstance = new Live2DModel()
    const objUrl = URL.createObjectURL(file)
    const res = await fetch(objUrl)
    const blob = await res.blob()

    const cleanup = () => {
      app.destroy()
      if (offscreenCanvas.isConnected)
        document.body.removeChild(offscreenCanvas)
      URL.revokeObjectURL(objUrl)
    }

    try {
      await Live2DFactory.setupLive2DModel(modelInstance, [new File([blob], file.name)], { autoInteract: false })
      app.stage.addChild(modelInstance)

      // transforms
      modelInstance.x = 275
      modelInstance.y = 450
      modelInstance.width = previewWidth
      modelInstance.height = previewHeight
      modelInstance.scale.set(0.1, 0.1)
      modelInstance.anchor.set(0.5, 0.5)

      await new Promise(resolve => setTimeout(resolve, 500))
      // Force a render to ensure the latest frame is in the drawing buffer
      app.renderer.render(app.stage)

      const croppedCanvas = cropImg(offscreenCanvas)

      // padding to 12:16
      const paddingCanvas = document.createElement('canvas')
      paddingCanvas.width = croppedCanvas.width > croppedCanvas.height / 16 * 12 ? croppedCanvas.width : croppedCanvas.height / 16 * 12
      paddingCanvas.height = paddingCanvas.width / 12 * 16
      const paddingCanvasCtx = paddingCanvas.getContext('2d')!

      paddingCanvasCtx.drawImage(croppedCanvas, (paddingCanvas.width - croppedCanvas.width) / 2, (paddingCanvas.height - croppedCanvas.height) / 2, croppedCanvas.width, croppedCanvas.height)
      const paddingDataUrl = paddingCanvas.toDataURL()

      cleanup()

      // return dataUrl
      return paddingDataUrl
    }
    catch (error) {
      console.error(error)
      cleanup()
    }
  }

  async function loadVrmModelPreview(file: File) {
    const offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = 1440
    offscreenCanvas.height = 2560
    offscreenCanvas.style.position = 'absolute'
    offscreenCanvas.style.top = '0'
    offscreenCanvas.style.left = '0'
    offscreenCanvas.style.objectFit = 'cover'
    offscreenCanvas.style.display = 'block'
    offscreenCanvas.style.zIndex = '10000000000'
    offscreenCanvas.style.opacity = '0'
    document.body.appendChild(offscreenCanvas)

    const renderer = new WebGLRenderer({
      canvas: offscreenCanvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(offscreenCanvas.width, offscreenCanvas.height, false)
    renderer.setPixelRatio(1)

    const scene = new Scene()
    const camera = new PerspectiveCamera(40, offscreenCanvas.width / offscreenCanvas.height, 0.01, 1000)
    const ambientLight = new AmbientLight(0xFFFFFF, 0.8)
    const directionalLight = new DirectionalLight(0xFFFFFF, 0.8)
    directionalLight.position.set(1, 1, 1)
    scene.add(ambientLight, directionalLight)

    const objUrl = URL.createObjectURL(file)
    let vrmInstance: VRM | undefined

    try {
      const vrmData = await loadVrm(objUrl, { scene, lookAt: true })
      if (!vrmData) {
        return
      }

      vrmInstance = vrmData._vrm
      const { modelCenter, initialCameraOffset } = vrmData

      camera.position.copy(modelCenter).add(initialCameraOffset)
      camera.lookAt(modelCenter)
      camera.updateProjectionMatrix()

      try {
        const animation = await loadVRMAnimation(animations.idleLoop.toString())
        const clip = await clipFromVRMAnimation(vrmData._vrm, animation)
        if (clip) {
          reAnchorRootPositionTrack(clip, vrmData._vrm)
          const mixer = new AnimationMixer(vrmData._vrm.scene)
          mixer.clipAction(clip).play()
          mixer.update(1 / 60)
        }
      }
      catch (error) {
        console.warn('Failed to load VRM idle animation for preview.', error)
      }

      await new Promise<void>((resolve) => {
        const start = performance.now()
        const step = (time: number) => {
          if (time - start >= 2000) {
            resolve()
            return
          }
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
      renderer.render(scene, camera)

      const croppedCanvas = cropImg(offscreenCanvas)

      // padding to 12:16
      const paddingCanvas = document.createElement('canvas')
      paddingCanvas.width = croppedCanvas.width > croppedCanvas.height / 16 * 12 ? croppedCanvas.width : croppedCanvas.height / 16 * 12
      paddingCanvas.height = paddingCanvas.width / 12 * 16
      const paddingCanvasCtx = paddingCanvas.getContext('2d')!

      paddingCanvasCtx.drawImage(croppedCanvas, (paddingCanvas.width - croppedCanvas.width) / 2, (paddingCanvas.height - croppedCanvas.height) / 2, croppedCanvas.width, croppedCanvas.height)
      return paddingCanvas.toDataURL()
    }
    catch (error) {
      console.error(error)
      return
    }
    finally {
      if (vrmInstance && 'dispose' in vrmInstance) {
        (vrmInstance as { dispose: () => void }).dispose()
      }

      renderer.dispose()
      document.body.removeChild(offscreenCanvas)
      URL.revokeObjectURL(objUrl)
    }
  }

  async function loadPNGtuberModelPreview(file: File): Promise<string | undefined> {
    try {
      const { loadPNGtuberFromZip } = await import('../utils/pngtuber-zip-loader')
      const model = await loadPNGtuberFromZip(file)

      // Get the idle default image as preview
      const idleImageBlob = model.images.get(model.manifest.idle.default)
      if (!idleImageBlob) {
        console.warn('PNGtuber idle image not found')
        return undefined
      }

      // Convert blob to data URL
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => resolve(undefined)
        reader.readAsDataURL(idleImageBlob)
      })
    }
    catch (error) {
      console.error('Failed to load PNGtuber preview:', error)
      return undefined
    }
  }

  async function addDisplayModel(format: DisplayModelFormat, file: File) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    const newDisplayModel: DisplayModelFile = { id: `display-model-${nanoid()}`, format, type: 'file', file, name: file.name, importedAt: Date.now() }

    if (format === DisplayModelFormat.Live2dZip) {
      const previewImage = await loadLive2DModelPreview(file)
      newDisplayModel.previewImage = previewImage
    }
    else if (format === DisplayModelFormat.VRM) {
      const previewImage = await loadVrmModelPreview(file)
      newDisplayModel.previewImage = previewImage
    }
    else if (format === DisplayModelFormat.PNGtuber) {
      const previewImage = await loadPNGtuberModelPreview(file)
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

  async function resetDisplayModels() {
    await loadDisplayModelsFromIndexedDB()
    const userModelIds = displayModels.value.filter(model => model.type === 'file').map(model => model.id)
    for (const id of userModelIds) {
      await removeDisplayModel(id)
    }

    displayModels.value = [...displayModelsPresets].sort((a, b) => b.importedAt - a.importedAt)
  }

  return {
    displayModels,
    displayModelsFromIndexedDBLoading,

    loadDisplayModelsFromIndexedDB,
    getDisplayModel,
    addDisplayModel,
    renameDisplayModel,
    removeDisplayModel,
    resetDisplayModels,
  }
})
