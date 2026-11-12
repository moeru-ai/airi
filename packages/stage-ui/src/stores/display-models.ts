import type { CloudDisplayModel } from '../services/display-model-sync'

import { errorMessageFrom } from '@moeru/std'
import { createEventHook, until } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore, getActivePinia } from 'pinia'
import { computed, getCurrentScope, ref, watch } from 'vue'

import { displayModelsRepo } from '../database/repos/display-models.repo'
import { downloadVerified } from '../libs/file-transfer/transfer'
import { requestDisplayModelDownload } from '../services/display-model-sync'
import { useAuthStore } from './auth'
import { resolveCloudOwnerId, useDisplayModelCloudStore } from './display-model-cloud'

export enum DisplayModelFormat {
  Live2dZip = 'live2d-zip',
  Live2dDirectory = 'live2d-directory',
  VRM = 'vrm',
  SpineZip = 'spine-zip',
  TachieZip = 'tachie-zip',
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
  /** The account whose cloud directory holds this model. Absent for device-only imports. */
  cloudOwnerId?: string
  /** The name that this device last agreed on with the account. A difference on one side is a rename on that side. */
  syncedName?: string
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

export type DisplayModelSyncStatus = 'local-only' | 'queued' | 'uploading' | 'synced' | 'cloud-only' | 'downloading' | 'failed'

const syncableFormats: string[] = [DisplayModelFormat.Live2dZip, DisplayModelFormat.VRM]

const displayModelsPresets: DisplayModel[] = [
  { id: 'preset-live2d-1', format: DisplayModelFormat.Live2dZip, type: 'url', url: presetLive2dProUrl, name: 'Hiyori (Pro)', previewImage: presetLive2dPreview, importedAt: 1733113886840 },
  { id: 'preset-live2d-2', format: DisplayModelFormat.Live2dZip, type: 'url', url: presetLive2dFreeUrl, name: 'Hiyori (Free)', previewImage: presetLive2dPreview, importedAt: 1733113886840 },
  { id: 'preset-vrm-1', format: DisplayModelFormat.VRM, type: 'url', url: presetVrmAvatarAUrl, name: 'AvatarSample_A', previewImage: presetVrmAvatarAPreview, importedAt: 1733113886840 },
  { id: 'preset-vrm-2', format: DisplayModelFormat.VRM, type: 'url', url: presetVrmAvatarBUrl, name: 'AvatarSample_B', previewImage: presetVrmAvatarBPreview, importedAt: 1733113886840 },
]

export const useDisplayModelsStore = defineStore('display-models', () => {
  const displayModels = ref<DisplayModel[]>([])

  // --- Cloud sync ---
  const pinia = getActivePinia()
  const storeScope = getCurrentScope()
  const cloud = useDisplayModelCloudStore()
  const cloudModels = computed(() => cloud.models)
  const downloadingIds = ref<string[]>([])
  // Keyed by owner and model id. Model ids are unique per owner on the server.
  const pendingDownloads = new Map<string, { promise: Promise<DisplayModelFile>, controller: AbortController }>()
  const downloadErrors = ref<Record<string, string>>({})
  const syncErrors = computed(() => ({ ...cloud.errors, ...downloadErrors.value }))
  /** Whole percent of each running upload. A model has no entry until its bytes start to send. */
  const uploadProgress = computed(() => cloud.uploadProgress)
  // Reports IDs that no longer exist on this device or in the account. Removing only the
  // local copy of a model that the account keeps does not report it, because the model can
  // download again. The card store removes the references to reported IDs.
  const displayModelsDeleted = createEventHook<[deletedIds: string[]]>()
  /** Increases when a model that this window could not load can have become available. */
  const availabilityRevision = computed(() => cloud.completedRuns + cloud.localRevision)
  let accountWatcherStarted = false

  let generateLive2DPreview: (file: File) => Promise<string | undefined>
  let generateVrmPreview: (file: File) => Promise<string | undefined>
  let generateSpinePreview: (file: File) => Promise<string | undefined>
  let generateTachiePreview: (file: File) => Promise<string | undefined>
  let generateMMDPreview: (file: File) => Promise<string | undefined>

  const displayModelsFromIndexedDBLoading = ref(false)
  let displayModelsLoadPromise: Promise<void> | undefined

  /** Downloaded private models stay hidden from other signed-in accounts on this device. */
  function isVisibleToAccount(model: DisplayModelFile) {
    const authStore = useAuthStore()
    return !model.cloudOwnerId || !authStore.isAuthenticated || authStore.userId === model.cloudOwnerId
  }

  function loadDisplayModelsFromIndexedDB() {
    if (!displayModelsLoadPromise) {
      displayModelsLoadPromise = (async () => {
        await until(displayModelsFromIndexedDBLoading).toBe(false)

        displayModelsFromIndexedDBLoading.value = true
        const models = [...displayModelsPresets]

        try {
          for (const model of await displayModelsRepo.list()) {
            if (isVisibleToAccount(model))
              models.push(model)
          }
        }
        catch (err) {
          console.error(err)
        }

        displayModels.value = models.sort((a, b) => b.importedAt - a.importedAt)
        displayModelsFromIndexedDBLoading.value = false
      })().finally(() => {
        displayModelsLoadPromise = undefined
      })
    }

    return displayModelsLoadPromise
  }

  // Another window changed a file. Wait for a load in progress, because it can have read the old files.
  watch(() => cloud.localRevision, async () => {
    await displayModelsLoadPromise
    await loadDisplayModelsFromIndexedDB()
  })

  // The leader removed the files of these models. Update its list before the card store reads it.
  cloud.onModelsDeleted(async (deletedIds) => {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    if (displayModels.value.some(model => deletedIds.includes(model.id)))
      displayModels.value = displayModels.value.filter(model => !deletedIds.includes(model.id))
    await displayModelsDeleted.trigger(deletedIds)
  })

  /** Tells other windows to read the files again. A failure leaves them stale until the next change. */
  async function announceLocalChange() {
    await cloud.announceLocalChange().catch(err => console.error('[display-models] failed to announce a local change:', err))
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
    if (modelFromMemory?.type === 'url' || (modelFromMemory && isVisibleToAccount(modelFromMemory)))
      return modelFromMemory

    // A card can reference a model that another account downloaded on this device.
    const modelFromFile = await displayModelsRepo.get(id)
    if (modelFromFile) {
      if (!isVisibleToAccount(modelFromFile))
        return undefined
      // Another window stored this file. List it, so the status stops reporting a cloud-only model.
      if (!modelFromMemory)
        displayModels.value = [modelFromFile, ...displayModels.value].sort((a, b) => b.importedAt - a.importedAt)
      return modelFromFile
    }

    // Fallback to in-memory presets if not found in storage
    return displayModelsPresets.find(model => model.id === id)
  }

  const loadLive2DModelPreview = (file: File) => generateLive2DPreview(file)
  const loadVrmModelPreview = (file: File) => generateVrmPreview(file)
  const loadSpineModelPreview = (file: File) => generateSpinePreview(file)
  const loadTachieModelPreview = (file: File) => generateTachiePreview(file)
  const loadMMDModelPreview = (file: File) => generateMMDPreview(file)

  async function generatePreview(format: DisplayModelFormat, file: File): Promise<string | undefined> {
    if (format === DisplayModelFormat.Live2dZip) {
      return loadLive2DModelPreview(file)
    }
    else if (format === DisplayModelFormat.VRM) {
      return loadVrmModelPreview(file)
    }
    else if (format === DisplayModelFormat.SpineZip) {
      return loadSpineModelPreview(file)
    }
    else if (format === DisplayModelFormat.TachieZip) {
      return loadTachieModelPreview(file)
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
        return await loadMMDModelPreview(file)
      }
      catch (err) {
        console.error('[display-models] MMD preview generation failed; importing without a thumbnail:', err)
      }
    }
    return undefined
  }

  async function addDisplayModel(format: DisplayModelFormat, file: File) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    const newDisplayModel: DisplayModelFile = { id: `display-model-${nanoid()}`, format, type: 'file', file, name: file.name, importedAt: Date.now() }

    newDisplayModel.previewImage = await generatePreview(format, file)

    displayModels.value.unshift(newDisplayModel)

    // NOTICE:
    // Keep this awaited. The settings model pick flow can call getDisplayModel immediately
    // after import; fire-and-forget persistence creates a race where the selected custom model
    // exists in the UI but is not yet readable from IndexedDB in a later route/render pass.
    // Source/context: model-selector import flow -> settings-stage-model.updateStageModel().
    // Removal condition: imported display models are persisted through a transactional queue
    // that blocks pick/navigation until the write is durably complete.
    await displayModelsRepo.save(newDisplayModel)
      .catch(err => console.error(err))

    await announceLocalChange()

    // The local copy is already usable. A failed enqueue only delays cloud sync.
    if (resolveCloudOwnerId(pinia) && syncableFormats.includes(format))
      await uploadDisplayModel(newDisplayModel.id).catch(err => console.error('[display-models] failed to queue cloud upload:', err))

    return newDisplayModel
  }

  async function renameDisplayModel(id: string, name: string) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    const displayModel = id.startsWith('display-model-')
      ? await displayModelsRepo.get(id)
      : displayModels.value.find(m => m.id === id)

    if (!displayModel)
      return

    displayModel.name = name

    // Update reactive state
    const index = displayModels.value.findIndex(m => m.id === id)
    if (index !== -1) {
      displayModels.value[index].name = name
    }

    if (displayModel.type !== 'file')
      return

    await displayModelsRepo.save(displayModel)
    await announceLocalChange()
    // The run sends the new name. A failure stays visible in `syncErrors`, and the next run sends it again.
    if (displayModel.cloudOwnerId)
      await refreshCloudModels()
  }

  async function removeLocalCopy(id: string) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    if (cloud.uploads[id])
      await cloud.cancelUpload(id)
    await displayModelsRepo.remove(id)
    displayModels.value = displayModels.value.filter(model => model.id !== id)
    await announceLocalChange()
  }

  /**
   * The account keeps a model when its directory lists it, or when this copy came from the account.
   * The second check holds while the directory is not loaded, or after sign-out or with sync off.
   */
  function isKeptByAccount(model: Pick<DisplayModelFile, 'id' | 'cloudOwnerId'>) {
    return !!model.cloudOwnerId || cloud.models.some(item => item.id === model.id)
  }

  /** Removes the model from this device. A model that the account keeps stays available for download. */
  async function removeDisplayModel(id: string) {
    const record = await displayModelsRepo.get(id)
    await removeLocalCopy(id)
    if (!isKeptByAccount(record ?? { id }))
      await displayModelsDeleted.trigger([id])
  }

  async function resetDisplayModels() {
    await loadDisplayModelsFromIndexedDB()
    const userModels = displayModels.value.filter((model): model is DisplayModelFile => model.type === 'file')
    for (const model of userModels) {
      await removeLocalCopy(model.id)
    }

    displayModels.value = [...displayModelsPresets].sort((a, b) => b.importedAt - a.importedAt)
    const deleted = userModels.filter(model => !isKeptByAccount(model)).map(model => model.id)
    if (deleted.length > 0)
      await displayModelsDeleted.trigger(deleted)
  }

  /** Models that exist only in the account directory and have no local file on this device. */
  const cloudOnlyModels = computed(() => cloud.models.filter(item => !displayModels.value.some(model => model.id === item.id)))

  const syncStatuses = computed(() => {
    const statuses: Record<string, DisplayModelSyncStatus> = {}
    const owner = cloud.ownerId
    if (!owner)
      return statuses

    const cloudIds = new Set(cloud.models.map(model => model.id))
    for (const model of displayModels.value) {
      if (model.type !== 'file' || !syncableFormats.includes(model.format))
        continue
      const queued = cloud.uploads[model.id]
      if (queued)
        statuses[model.id] = queued === 'running' ? 'uploading' : queued
      else
        // A finished upload marks the copy before the directory lists it, and a failed refresh can delay the list.
        statuses[model.id] = cloudIds.has(model.id) || model.cloudOwnerId === owner ? 'synced' : 'local-only'
    }
    for (const item of cloudOnlyModels.value)
      statuses[item.id] = downloadingIds.value.includes(item.id) ? 'downloading' : 'cloud-only'
    return statuses
  })

  /** Reads the account directory now, for example when a model list opens. A failure only logs. */
  async function refreshCloudModels() {
    await cloud.synchronize().catch(err => console.error('[display-models] failed to refresh the cloud models:', err))
  }

  /** Queues a local model for upload. Calling it again after a failure retries the upload. */
  async function uploadDisplayModel(id: string) {
    const model = displayModels.value.find(item => item.id === id)
    const ownerId = resolveCloudOwnerId(pinia)
    if (!ownerId || model?.type !== 'file' || !syncableFormats.includes(model.format))
      return
    await cloud.queueUpload(id, ownerId)
  }

  /**
   * Resolves a model for rendering. Downloads and verifies a cloud-only model first.
   * Returns undefined when neither this device nor the account directory has the model.
   * Rejects when the download fails, so callers can keep the selection.
   */
  async function ensureDisplayModelAvailable(id: string) {
    const local = await getDisplayModel(id)
    if (local)
      return local

    const ownerId = resolveCloudOwnerId(pinia)
    if (!ownerId)
      return undefined

    // At startup the leader can still be on its first run. A caller keeps the selection after this timeout and retries.
    await until(() => cloud.ownerId === ownerId && cloud.directoryLoaded).toBe(true, { timeout: 15_000, throwOnTimeout: true })
    const cloudModel = cloud.models.find(model => model.id === id)
    if (!cloudModel)
      return undefined

    // The selector and the stage settings both resolve a picked model. They share one download.
    const key = `${ownerId}/${id}`
    let download = pendingDownloads.get(key)
    if (!download) {
      const controller = new AbortController()
      const entry = {
        controller,
        promise: downloadCloudModel(cloudModel, ownerId, controller.signal).finally(() => {
          if (pendingDownloads.get(key) === entry)
            pendingDownloads.delete(key)
        }),
      }
      pendingDownloads.set(key, entry)
      download = entry
    }
    return await download.promise
  }

  /** Downloads a model for the owner that was signed in when the download started. */
  async function downloadCloudModel(cloudModel: CloudDisplayModel, ownerId: string, signal: AbortSignal) {
    const id = cloudModel.id
    const { [id]: _previousError, ...otherErrors } = downloadErrors.value
    downloadErrors.value = otherErrors
    downloadingIds.value = [...downloadingIds.value, id]
    try {
      const source = await requestDisplayModelDownload(id, signal)
      const blob = await downloadVerified(source, signal)
      const file = new File([blob], cloudModel.originalFilename)
      const model: DisplayModelFile = {
        id,
        format: cloudModel.format as DisplayModelFormat,
        type: 'file',
        file,
        name: cloudModel.name,
        importedAt: Date.parse(cloudModel.createdAt),
        cloudOwnerId: ownerId,
        syncedName: cloudModel.name,
      }
      model.previewImage = await generatePreview(model.format, file).catch((err) => {
        console.error('[display-models] preview generation failed for a downloaded model:', err)
        return undefined
      })
      // The account changed during the download. The bytes belong to the previous account.
      signal.throwIfAborted()
      await displayModelsRepo.save(model)
      displayModels.value = [model, ...displayModels.value.filter(item => item.id !== id)].sort((a, b) => b.importedAt - a.importedAt)
      await announceLocalChange()
      return model
    }
    catch (err) {
      if (!signal.aborted)
        downloadErrors.value = { ...downloadErrors.value, [id]: errorMessageFrom(err) ?? 'Download failed' }
      throw err
    }
    finally {
      downloadingIds.value = downloadingIds.value.filter(item => item !== id)
    }
  }

  /** Deletes the model from the account. Other devices drop their cached copy on their next sync. */
  async function deleteCloudDisplayModelById(id: string) {
    await cloud.deleteModel(id)
  }

  function abortDownloads() {
    for (const download of pendingDownloads.values())
      download.controller.abort()
    pendingDownloads.clear()
    downloadErrors.value = {}
  }

  /** Follows the account in this window. The bytes and the list of the previous account must not stay. */
  function startAccountWatcher() {
    if (accountWatcherStarted)
      return
    accountWatcherStarted = true

    const authStore = useAuthStore()
    storeScope?.run(() => {
      // In the same task as the change, because the next request of a download sends the token of the new account.
      watch(() => resolveCloudOwnerId(pinia), abortDownloads, { flush: 'sync' })
      watch(() => authStore.isAuthenticated ? authStore.userId : undefined, () => loadDisplayModelsFromIndexedDB())
    })
  }

  async function initialize() {
    // Start sync before the preview renderers load. A renderer that fails to load must not stop sync.
    startAccountWatcher()
    cloud.start()

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
    displayModels,
    displayModelsFromIndexedDBLoading,
    cloudModels,
    availabilityRevision,
    cloudOnlyModels,
    syncStatuses,
    syncErrors,
    uploadProgress,

    initialize,
    loadDisplayModelsFromIndexedDB,
    getDisplayModel,
    ensureDisplayModelAvailable,
    refreshCloudModels,
    uploadDisplayModel,
    deleteCloudDisplayModel: deleteCloudDisplayModelById,
    addDisplayModel,
    renameDisplayModel,
    removeDisplayModel,
    resetDisplayModels,
    onDisplayModelsDeleted: displayModelsDeleted.on,
  }
})
