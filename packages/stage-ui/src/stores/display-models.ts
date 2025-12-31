import cropImg from '@lemonneko/crop-empty-pixels'
import JSZip from 'jszip'
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
import '../utils/live2d-opfs-registration'

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
  cached?: boolean
  cacheKey?: string
}

const displayModelsPresets: DisplayModel[] = [
  { id: 'preset-live2d-1', format: DisplayModelFormat.Live2dZip, type: 'url', url: presetLive2dProUrl, name: 'Hiyori (Pro)', previewImage: presetLive2dPreview, importedAt: 1733113886840 },
  { id: 'preset-live2d-2', format: DisplayModelFormat.Live2dZip, type: 'url', url: presetLive2dFreeUrl, name: 'Hiyori (Free)', previewImage: presetLive2dPreview, importedAt: 1733113886840 },
  { id: 'preset-vrm-1', format: DisplayModelFormat.VRM, type: 'url', url: presetVrmAvatarAUrl, name: 'AvatarSample_A', previewImage: presetVrmAvatarAPreview, importedAt: 1733113886840 },
  { id: 'preset-vrm-2', format: DisplayModelFormat.VRM, type: 'url', url: presetVrmAvatarBUrl, name: 'AvatarSample_B', previewImage: presetVrmAvatarBPreview, importedAt: 1733113886840 },
]

// Parse VPM JSON format
interface VPMPackage {
  url?: string
  version?: string
}

interface VPMManifest {
  packages?: Record<string, VPMPackage>
  dependencies?: Record<string, string>
}

// Parse model3.json and collect all referenced files
interface Model3Json {
  Version?: number
  FileReferences?: {
    Moc?: string
    Textures?: string[]
    Physics?: string
    Pose?: string
    DisplayInfo?: string
    Expressions?: Array<{ Name?: string, File?: string }>
    Motions?: Record<string, Array<{ File?: string, Sound?: string }>>
    UserData?: string
  }
}

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

    // padding to 12:16
    const paddingCanvas = document.createElement('canvas')
    paddingCanvas.width = croppedCanvas.width > croppedCanvas.height / 16 * 12 ? croppedCanvas.width : croppedCanvas.height / 16 * 12
    paddingCanvas.height = paddingCanvas.width / 12 * 16
    const paddingCanvasCtx = paddingCanvas.getContext('2d')!

    paddingCanvasCtx.drawImage(croppedCanvas, (paddingCanvas.width - croppedCanvas.width) / 2, (paddingCanvas.height - croppedCanvas.height) / 2, croppedCanvas.width, croppedCanvas.height)
    const paddingDataUrl = paddingCanvas.toDataURL()

    app.destroy()
    document.body.removeChild(offscreenCanvas)
    URL.revokeObjectURL(objUrl)

    // return dataUrl
    return paddingDataUrl
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

  async function resetDisplayModels() {
    await loadDisplayModelsFromIndexedDB()
    const userModelIds = displayModels.value.filter(model => model.type === 'file').map(model => model.id)
    for (const id of userModelIds) {
      await removeDisplayModel(id)
    }

    displayModels.value = [...displayModelsPresets].sort((a, b) => b.importedAt - a.importedAt)
  }

  // Parse VPM JSON format
  async function parseVPMJson(url: string): Promise<{ url: string, name: string } | null> {
    try {
      const response = await fetch(url)
      const data = await response.json() as VPMManifest

      // Try to find VRM package in packages field
      if (data.packages) {
        for (const [name, pkg] of Object.entries(data.packages)) {
          if (pkg.url && (pkg.url.endsWith('.vrm') || pkg.url.endsWith('.zip'))) {
            return { url: pkg.url, name }
          }
        }
      }

      return null
    }
    catch (error) {
      console.error('Failed to parse VPM JSON:', error)
      return null
    }
  }

  // Convert GitHub blob URL to raw URL
  function convertGitHubBlobUrlToRaw(url: string): string {
    // Convert blob URLs to raw URLs
    // https://github.com/user/repo/blob/branch/path -> https://raw.githubusercontent.com/user/repo/branch/path
    // https://github.com/user/repo/raw/branch/path -> already raw, keep it

    if (url.includes('github.com') && url.includes('/blob/')) {
      return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
    }

    return url
  }

  // Load model3.json and fetch all referenced resources
  async function loadModel3JsonAndResources(model3JsonUrl: string): Promise<File> {
    // Convert GitHub URL to raw if needed
    const rawUrl = convertGitHubBlobUrlToRaw(model3JsonUrl)
    const baseUrl = rawUrl.substring(0, rawUrl.lastIndexOf('/'))

    // Fetch model3.json
    const response = await fetch(rawUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch model3.json: ${response.statusText}`)
    }

    const model3JsonText = await response.text()
    const model3Json: Model3Json = JSON.parse(model3JsonText)

    // Collect all file paths from model3.json
    const filesToFetch: Set<string> = new Set()
    filesToFetch.add(model3JsonUrl.split('/').pop() || 'model.model3.json')

    const fileRefs = model3Json.FileReferences
    if (fileRefs) {
      // Add moc file
      if (fileRefs.Moc) filesToFetch.add(fileRefs.Moc)

      // Add textures
      if (fileRefs.Textures) {
        fileRefs.Textures.forEach(texture => filesToFetch.add(texture))
      }

      // Add physics
      if (fileRefs.Physics) filesToFetch.add(fileRefs.Physics)

      // Add pose
      if (fileRefs.Pose) filesToFetch.add(fileRefs.Pose)

      // Add display info
      if (fileRefs.DisplayInfo) filesToFetch.add(fileRefs.DisplayInfo)

      // Add user data
      if (fileRefs.UserData) filesToFetch.add(fileRefs.UserData)

      // Add expressions
      if (fileRefs.Expressions) {
        fileRefs.Expressions.forEach((exp) => {
          if (exp.File) filesToFetch.add(exp.File)
        })
      }

      // Add motions
      if (fileRefs.Motions) {
        Object.values(fileRefs.Motions).forEach((motionGroup) => {
          motionGroup.forEach((motion) => {
            if (motion.File) filesToFetch.add(motion.File)
            if (motion.Sound) filesToFetch.add(motion.Sound)
          })
        })
      }
    }

    // Create a zip file
    const zip = new JSZip()

    // Add model3.json to zip
    zip.file(model3JsonUrl.split('/').pop() || 'model.model3.json', model3JsonText)

    // Fetch and add all referenced files
    const fetchPromises = Array.from(filesToFetch)
      .filter(file => file !== (model3JsonUrl.split('/').pop() || 'model.model3.json'))
      .map(async (relativePath) => {
        try {
          const fileUrl = `${baseUrl}/${relativePath}`
          const fileResponse = await fetch(convertGitHubBlobUrlToRaw(fileUrl))

          if (!fileResponse.ok) {
            console.warn(`Failed to fetch ${relativePath}: ${fileResponse.statusText}`)
            return
          }

          const fileBlob = await fileResponse.blob()
          zip.file(relativePath, fileBlob)
        }
        catch (error) {
          console.warn(`Error fetching ${relativePath}:`, error)
        }
      })

    await Promise.all(fetchPromises)

    // Generate zip blob
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    // Extract model name from URL
    const urlParts = model3JsonUrl.split('/')
    const modelName = urlParts[urlParts.length - 2] || 'imported-model'

    return new File([zipBlob], `${modelName}.zip`, { type: 'application/zip' })
  }

  // Add display model from URL
  async function addDisplayModelFromURL(url: string, format?: DisplayModelFormat): Promise<DisplayModelURL> {
    await until(displayModelsFromIndexedDBLoading).toBe(false)

    let actualUrl = url
    let detectedFormat = format
    let modelName = url.split('/').pop() || 'imported-model'
    let fileToCache: File | undefined

    // Check if it's a model3.json URL
    if (url.endsWith('.model3.json') || url.includes('.model3.json')) {
      // Load model3.json and all its resources, package into zip
      fileToCache = await loadModel3JsonAndResources(url)
      detectedFormat = DisplayModelFormat.Live2dZip
      modelName = fileToCache.name.replace('.zip', '')
    }
    // Check if it's a JSON URL (possibly VPM)
    else if (url.endsWith('.json')) {
      const vpmData = await parseVPMJson(url)
      if (vpmData) {
        actualUrl = vpmData.url
        modelName = vpmData.name
      }
    }

    // Auto-detect format if not provided and not already detected
    if (!detectedFormat && !fileToCache) {
      if (actualUrl.endsWith('.vrm')) {
        detectedFormat = DisplayModelFormat.VRM
      }
      else if (actualUrl.endsWith('.zip')) {
        // Assume Live2D for zip files
        detectedFormat = DisplayModelFormat.Live2dZip
      }
      else {
        throw new Error('Unable to detect model format. Please specify format manually.')
      }
    }

    // Fetch and cache the model if not already done
    const cacheKey = `model-cache-${nanoid()}`
    try {
      let file: File

      if (fileToCache) {
        // Already have the file from model3.json processing
        file = fileToCache
      }
      else {
        // Fetch from URL
        const response = await fetch(actualUrl)
        const blob = await response.blob()
        file = new File([blob], modelName, { type: blob.type })
      }

      // Cache the file
      await localforage.setItem(cacheKey, { file, url: actualUrl })

      const newDisplayModel: DisplayModelURL = {
        id: `display-model-${nanoid()}`,
        format: detectedFormat!,
        type: 'url',
        url: actualUrl,
        name: modelName,
        importedAt: Date.now(),
        cached: true,
        cacheKey,
      }

      // Generate preview for Live2D models
      if (detectedFormat === DisplayModelFormat.Live2dZip) {
        const previewImage = await loadLive2DModelPreview(file)
        if (previewImage) {
          newDisplayModel.previewImage = previewImage
        }
      }

      displayModels.value.unshift(newDisplayModel)

      // Save metadata to IndexedDB
      await localforage.setItem(newDisplayModel.id, {
        ...newDisplayModel,
        // Don't duplicate the file data in metadata
        file: undefined,
      })

      return newDisplayModel
    }
    catch (error) {
      console.error('Failed to fetch and cache model:', error)
      throw error
    }
  }

  // Get cached model file
  async function getCachedModelFile(cacheKey: string): Promise<File | null> {
    try {
      const cached = await localforage.getItem<{ file: File, url: string }>(cacheKey)
      return cached?.file || null
    }
    catch (error) {
      console.error('Failed to get cached model:', error)
      return null
    }
  }

  return {
    displayModels,
    displayModelsFromIndexedDBLoading,

    loadDisplayModelsFromIndexedDB,
    getDisplayModel,
    addDisplayModel,
    addDisplayModelFromURL,
    getCachedModelFile,
    renameDisplayModel,
    removeDisplayModel,
    resetDisplayModels,
  }
})
