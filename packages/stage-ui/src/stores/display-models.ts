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
    closed?: string
    open?: string
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

// Preview generation constants
const PREVIEW_WIDTH = 1440
const PREVIEW_HEIGHT = 2560
const PREVIEW_RESOLUTION = 2
const PREVIEW_ASPECT_RATIO = { width: 12, height: 16 }

// Live2D preview constants
const LIVE2D_PREVIEW_POSITION_X = 275
const LIVE2D_PREVIEW_POSITION_Y = 450
const LIVE2D_PREVIEW_SCALE = 0.1
const LIVE2D_PREVIEW_RENDER_DELAY_MS = 500

// VRM preview constants
const VRM_PREVIEW_CAMERA_FOV = 40
const VRM_PREVIEW_CAMERA_NEAR = 0.01
const VRM_PREVIEW_CAMERA_FAR = 1000
const VRM_PREVIEW_LIGHT_INTENSITY = 0.8
const VRM_PREVIEW_ANIMATION_FRAME_RATE = 1 / 60
const VRM_PREVIEW_ANIMATION_DURATION_MS = 2000

/**
 * Create an offscreen canvas for preview generation
 */
function createPreviewCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_WIDTH * PREVIEW_RESOLUTION
  canvas.height = PREVIEW_HEIGHT * PREVIEW_RESOLUTION
  canvas.style.position = 'absolute'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.objectFit = 'cover'
  canvas.style.display = 'block'
  canvas.style.zIndex = '10000000000'
  canvas.style.opacity = '0'
  document.body.appendChild(canvas)
  return canvas
}

/**
 * Crop empty pixels and pad to target aspect ratio (12:16)
 */
function cropAndPadPreview(canvas: HTMLCanvasElement): string {
  const croppedCanvas = cropImg(canvas)

  // Calculate padding dimensions to achieve 12:16 aspect ratio
  const targetAspect = PREVIEW_ASPECT_RATIO.width / PREVIEW_ASPECT_RATIO.height
  const croppedAspect = croppedCanvas.width / croppedCanvas.height

  let paddingWidth: number
  let paddingHeight: number

  if (croppedAspect > targetAspect) {
    // Cropped image is wider, fit to width
    paddingWidth = croppedCanvas.width
    paddingHeight = paddingWidth / targetAspect
  }
  else {
    // Cropped image is taller, fit to height
    paddingHeight = croppedCanvas.height
    paddingWidth = paddingHeight * targetAspect
  }

  const paddingCanvas = document.createElement('canvas')
  paddingCanvas.width = paddingWidth
  paddingCanvas.height = paddingHeight
  const paddingCtx = paddingCanvas.getContext('2d')!

  // Center the cropped image in the padding canvas
  const offsetX = (paddingWidth - croppedCanvas.width) / 2
  const offsetY = (paddingHeight - croppedCanvas.height) / 2
  paddingCtx.drawImage(croppedCanvas, offsetX, offsetY, croppedCanvas.width, croppedCanvas.height)

  return paddingCanvas.toDataURL()
}

export const useDisplayModelsStore = defineStore('display-models', () => {
  const displayModels = ref<DisplayModel[]>([])

  const displayModelsFromIndexedDBLoading = ref(false)

  async function loadDisplayModelsFromIndexedDB() {
    await until(displayModelsFromIndexedDBLoading).toBe(false)

    displayModelsFromIndexedDBLoading.value = true
    const models = [...displayModelsPresets]

    try {
      await localforage.iterate<{ format: DisplayModelFormat, file: File, importedAt: number, previewImage?: string }, void>(async (val, key) => {
        if (key.startsWith('display-model-')) {
          let previewImage = val.previewImage

          // Regenerate preview if missing or invalid format for PNGtuber models
          const needsRegeneration = val.format === DisplayModelFormat.PNGtuber && (
            !previewImage
            || !previewImage.startsWith('data:image/')
          )

          if (needsRegeneration) {
            try {
              previewImage = await loadPNGtuberModelPreview(val.file)
              if (previewImage) {
                // Update the stored model with the new preview
                const updatedModel = { ...val, previewImage }
                await localforage.setItem(key, updatedModel)
              }
              else {
                console.warn('[Display Models] Failed to generate preview for:', key)
              }
            }
            catch (error) {
              console.error('[Display Models] Failed to regenerate preview for:', key, error)
            }
          }

          models.push({ id: key, format: val.format, type: 'file', file: val.file, name: val.file.name, importedAt: val.importedAt, previewImage })
        }
      })
    }
    catch (err) {
      console.error('[Display Models] Error loading from IndexedDB:', err)
    }

    displayModels.value = models.sort((a, b) => b.importedAt - a.importedAt)
    displayModelsFromIndexedDBLoading.value = false
  }

  async function getDisplayModel(id: string): Promise<DisplayModel | undefined> {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    const modelFromFile = await localforage.getItem<DisplayModelFile>(id)
    if (modelFromFile) {
      return modelFromFile
    }

    // Fallback to in-memory presets if not found in localforage
    return displayModelsPresets.find(model => model.id === id)
  }

  async function loadLive2DModelPreview(file: File): Promise<string | undefined> {
    Live2DModel.registerTicker(Ticker)
    extensions.add(TickerPlugin)

    const offscreenCanvas = createPreviewCanvas()

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
    app.stage.scale.set(PREVIEW_RESOLUTION)
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
      modelInstance.x = LIVE2D_PREVIEW_POSITION_X
      modelInstance.y = LIVE2D_PREVIEW_POSITION_Y
      modelInstance.width = PREVIEW_WIDTH
      modelInstance.height = PREVIEW_HEIGHT
      modelInstance.scale.set(LIVE2D_PREVIEW_SCALE, LIVE2D_PREVIEW_SCALE)
      modelInstance.anchor.set(0.5, 0.5)

      await new Promise(resolve => setTimeout(resolve, LIVE2D_PREVIEW_RENDER_DELAY_MS))
      // Force a render to ensure the latest frame is in the drawing buffer
      app.renderer.render(app.stage)

      const dataUrl = cropAndPadPreview(offscreenCanvas)

      cleanup()

      return dataUrl
    }
    catch (error) {
      console.error('[Display Models] Failed to load Live2D preview:', error)
      cleanup()
    }
  }

  async function loadVrmModelPreview(file: File): Promise<string | undefined> {
    const offscreenCanvas = createPreviewCanvas()

    const renderer = new WebGLRenderer({
      canvas: offscreenCanvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(offscreenCanvas.width, offscreenCanvas.height, false)
    renderer.setPixelRatio(1)

    const scene = new Scene()
    const camera = new PerspectiveCamera(VRM_PREVIEW_CAMERA_FOV, offscreenCanvas.width / offscreenCanvas.height, VRM_PREVIEW_CAMERA_NEAR, VRM_PREVIEW_CAMERA_FAR)
    const ambientLight = new AmbientLight(0xFFFFFF, VRM_PREVIEW_LIGHT_INTENSITY)
    const directionalLight = new DirectionalLight(0xFFFFFF, VRM_PREVIEW_LIGHT_INTENSITY)
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
          mixer.update(VRM_PREVIEW_ANIMATION_FRAME_RATE)
        }
      }
      catch (error) {
        console.warn('[Display Models] Failed to load VRM idle animation for preview:', error)
      }

      await new Promise<void>((resolve) => {
        const start = performance.now()
        const step = (time: number) => {
          if (time - start >= VRM_PREVIEW_ANIMATION_DURATION_MS) {
            resolve()
            return
          }
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
      renderer.render(scene, camera)

      return cropAndPadPreview(offscreenCanvas)
    }
    catch (error) {
      console.error('[Display Models] Failed to load VRM preview:', error)
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
      const idleImagePath = model.manifest.idle.default
      const idleImageBlob = model.images.get(idleImagePath)

      if (!idleImageBlob) {
        console.warn('[Display Models] PNGtuber idle image not found in images map. Available keys:', Array.from(model.images.keys()))
        return undefined
      }

      // Load image and draw to canvas (similar to Live2D/VRM preview generation)
      return new Promise((resolve) => {
        const img = new Image()
        const blobUrl = URL.createObjectURL(idleImageBlob)

        img.onload = () => {
          const offscreenCanvas = createPreviewCanvas()
          const ctx = offscreenCanvas.getContext('2d')!

          // Calculate scale to fit image in canvas while maintaining aspect ratio
          const imgAspect = img.width / img.height
          const canvasAspect = PREVIEW_WIDTH / PREVIEW_HEIGHT

          let drawWidth = PREVIEW_WIDTH * PREVIEW_RESOLUTION
          let drawHeight = PREVIEW_HEIGHT * PREVIEW_RESOLUTION
          let drawX = 0
          let drawY = 0

          if (imgAspect > canvasAspect) {
            // Image is wider, fit to width
            drawHeight = drawWidth / imgAspect
            drawY = (PREVIEW_HEIGHT * PREVIEW_RESOLUTION - drawHeight) / 2
          }
          else {
            // Image is taller, fit to height
            drawWidth = drawHeight * imgAspect
            drawX = (PREVIEW_WIDTH * PREVIEW_RESOLUTION - drawWidth) / 2
          }

          // Draw image to canvas
          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

          const dataUrl = cropAndPadPreview(offscreenCanvas)

          // Cleanup
          if (offscreenCanvas.isConnected)
            document.body.removeChild(offscreenCanvas)
          URL.revokeObjectURL(blobUrl)
          resolve(dataUrl)
        }

        img.onerror = (error) => {
          console.error('[Display Models] PNGtuber preview image load error:', error)
          URL.revokeObjectURL(blobUrl)
          resolve(undefined)
        }

        img.src = blobUrl
      })
    }
    catch (error) {
      console.error('[Display Models] Failed to load PNGtuber preview:', error)
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
      if (!previewImage) {
        console.warn('[Display Models] PNGtuber preview image generation failed, model will not be added:', file.name)
        return
      }

      newDisplayModel.previewImage = previewImage
    }

    displayModels.value.unshift(newDisplayModel)

    localforage.setItem<DisplayModelFile>(newDisplayModel.id, newDisplayModel)
      .catch(err => console.error('[Display Models] Failed to save model to IndexedDB:', err))
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
