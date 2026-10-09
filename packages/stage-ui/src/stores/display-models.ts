import type { TransferTask } from '../libs/file-transfer/transfer-queue'
import type { CloudDisplayModel } from '../services/display-model-sync'

import { errorMessageFrom } from '@moeru/std'
import { until } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import * as v from 'valibot'

import { displayModelsRepo } from '../database/repos/display-models.repo'
import { DISPLAY_MODEL_SYNC_FLAG } from '../libs/feature-flags'
import { downloadVerified, putToTarget, sha256Hex } from '../libs/file-transfer/transfer'
import { TransferQueue } from '../libs/file-transfer/transfer-queue'
import {
  completeDisplayModelUpload,
  deleteCloudDisplayModel,
  listCloudDisplayModels,
  renameCloudDisplayModel,
  requestDisplayModelDownload,
  reserveDisplayModelUpload,
} from '../services/display-model-sync'
import { useAuthStore } from './auth'
import { useFeatureFlagsStore } from './feature-flags'

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
const uploadTaskKind = 'upload-display-model'
const UploadPayloadSchema = v.object({ modelId: v.string(), requestId: v.string() })

const displayModelsPresets: DisplayModel[] = [
  { id: 'preset-live2d-1', format: DisplayModelFormat.Live2dZip, type: 'url', url: presetLive2dProUrl, name: 'Hiyori (Pro)', previewImage: presetLive2dPreview, importedAt: 1733113886840 },
  { id: 'preset-live2d-2', format: DisplayModelFormat.Live2dZip, type: 'url', url: presetLive2dFreeUrl, name: 'Hiyori (Free)', previewImage: presetLive2dPreview, importedAt: 1733113886840 },
  { id: 'preset-vrm-1', format: DisplayModelFormat.VRM, type: 'url', url: presetVrmAvatarAUrl, name: 'AvatarSample_A', previewImage: presetVrmAvatarAPreview, importedAt: 1733113886840 },
  { id: 'preset-vrm-2', format: DisplayModelFormat.VRM, type: 'url', url: presetVrmAvatarBUrl, name: 'AvatarSample_B', previewImage: presetVrmAvatarBPreview, importedAt: 1733113886840 },
]

export const useDisplayModelsStore = defineStore('display-models', () => {
  const displayModels = ref<DisplayModel[]>([])

  // --- Cloud sync ---
  const cloudOwnerId = ref<string>()
  const cloudModels = ref<CloudDisplayModel[]>([])
  const cloudDirectoryLoaded = ref(false)
  const queuedUploads = ref<Record<string, TransferTask['status']>>({})
  const downloadingIds = ref<string[]>([])
  const syncErrors = ref<Record<string, string>>({})

  const transferQueue = new TransferQueue(
    { [uploadTaskKind]: runUploadTask },
    {
      save: task => displayModelsRepo.saveUpload(task),
      remove: id => displayModelsRepo.removeUpload(id),
      list: () => displayModelsRepo.listUploads(),
    },
    (task, removed) => {
      const { [task.id]: _previous, ...rest } = queuedUploads.value
      queuedUploads.value = removed ? rest : { ...rest, [task.id]: task.status }
      if (task.status === 'failed' && !removed)
        syncErrors.value = { ...syncErrors.value, [task.id]: task.error ?? 'Upload failed' }
    },
  )

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
    const authStore = useAuthStore()

    try {
      await displayModelsRepo.migrateFromLocalforage()
      for (const model of await displayModelsRepo.list()) {
        // Downloaded private models stay hidden from other signed-in accounts on this device.
        if (model.cloudOwnerId && authStore.isAuthenticated && authStore.userId !== model.cloudOwnerId)
          continue
        models.push(model)
      }
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

    const modelFromFile = await displayModelsRepo.get(id)
    if (modelFromFile) {
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

    // The local copy is already usable. A failed enqueue only delays cloud sync.
    if (cloudOwnerId.value && syncableFormats.includes(format))
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

    if (displayModel.type === 'file')
      await displayModelsRepo.save(displayModel)

    const cloudModel = cloudModels.value.find(model => model.id === id)
    if (cloudModel) {
      try {
        replaceCloudModel(await renameCloudDisplayModel(id, name, cloudModel.revision))
      }
      catch (err) {
        syncErrors.value = { ...syncErrors.value, [id]: errorMessageFrom(err) ?? 'Rename failed' }
      }
    }
  }

  async function removeDisplayModel(id: string) {
    await until(displayModelsFromIndexedDBLoading).toBe(false)
    if (queuedUploads.value[id])
      await transferQueue.cancel(id)
    await displayModelsRepo.remove(id)
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

  /** Models that exist only in the account directory and have no local file on this device. */
  const cloudOnlyModels = computed(() => cloudModels.value.filter(cloud => !displayModels.value.some(model => model.id === cloud.id)))

  const syncStatuses = computed(() => {
    const statuses: Record<string, DisplayModelSyncStatus> = {}
    if (!cloudOwnerId.value)
      return statuses

    const cloudIds = new Set(cloudModels.value.map(model => model.id))
    for (const model of displayModels.value) {
      if (model.type !== 'file' || !syncableFormats.includes(model.format))
        continue
      const queued = queuedUploads.value[model.id]
      statuses[model.id] = queued === 'running'
        ? 'uploading'
        : queued ?? (cloudIds.has(model.id) ? 'synced' : 'local-only')
    }
    for (const cloud of cloudOnlyModels.value)
      statuses[cloud.id] = downloadingIds.value.includes(cloud.id) ? 'downloading' : 'cloud-only'
    return statuses
  })

  function replaceCloudModel(next: CloudDisplayModel) {
    cloudModels.value = [...cloudModels.value.filter(model => model.id !== next.id), ...(next.deletedAt ? [] : [next])]
  }

  async function refreshCloudModels() {
    const ownerId = cloudOwnerId.value
    const models = await listCloudDisplayModels()
    if (ownerId !== cloudOwnerId.value)
      return

    const deletedIds = new Set(models.filter(model => model.deletedAt).map(model => model.id))
    cloudModels.value = models.filter(model => !model.deletedAt)
    // Deletion markers remove the cached copy that this account downloaded or uploaded.
    for (const model of displayModels.value) {
      if (model.type === 'file' && model.cloudOwnerId === ownerId && deletedIds.has(model.id))
        await removeDisplayModel(model.id)
    }
    cloudDirectoryLoaded.value = true
  }

  async function runUploadTask(task: TransferTask, signal: AbortSignal) {
    const { modelId, requestId } = v.parse(UploadPayloadSchema, task.payload)
    const record = await displayModelsRepo.get(modelId)
    // The model was removed from this device before its turn. Nothing is left to upload.
    if (!record)
      return

    const upload = await reserveDisplayModelUpload({
      id: modelId,
      requestId,
      format: record.format as 'live2d-zip' | 'vrm',
      name: record.name,
      originalFilename: record.file.name,
      byteSize: record.file.size,
      sha256: await sha256Hex(record.file),
    }, signal)
    if (upload) {
      await putToTarget(record.file, upload, signal)
      await completeDisplayModelUpload(upload.uploadId, signal)
    }

    if (signal.aborted)
      return
    const synced: DisplayModelFile = { ...record, cloudOwnerId: task.ownerId }
    await displayModelsRepo.save(synced)
    const index = displayModels.value.findIndex(model => model.id === modelId)
    if (index !== -1)
      displayModels.value[index] = synced
    const { [modelId]: _cleared, ...rest } = syncErrors.value
    syncErrors.value = rest
    await refreshCloudModels()
  }

  /** Queues a local model for upload. Calling it again after a failure retries the upload. */
  async function uploadDisplayModel(id: string) {
    const model = displayModels.value.find(item => item.id === id)
    if (!cloudOwnerId.value || model?.type !== 'file' || !syncableFormats.includes(model.format))
      return
    if (queuedUploads.value[id] === 'failed')
      return transferQueue.retry(id)
    if (queuedUploads.value[id])
      return
    await transferQueue.enqueue({ id, kind: uploadTaskKind, payload: { modelId: id, requestId: nanoid() } })
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

    if (cloudOwnerId.value)
      await until(cloudDirectoryLoaded).toBe(true, { timeout: 15_000, throwOnTimeout: true })
    const cloud = cloudModels.value.find(model => model.id === id)
    if (!cloud)
      return undefined

    downloadingIds.value = [...downloadingIds.value, id]
    try {
      const source = await requestDisplayModelDownload(id)
      const blob = await downloadVerified(source)
      const file = new File([blob], cloud.originalFilename)
      const model: DisplayModelFile = {
        id,
        format: cloud.format as DisplayModelFormat,
        type: 'file',
        file,
        name: cloud.name,
        importedAt: Date.parse(cloud.createdAt),
        cloudOwnerId: cloudOwnerId.value,
      }
      model.previewImage = await generatePreview(model.format, file).catch((err) => {
        console.error('[display-models] preview generation failed for a downloaded model:', err)
        return undefined
      })
      await displayModelsRepo.save(model)
      displayModels.value = [model, ...displayModels.value].sort((a, b) => b.importedAt - a.importedAt)
      return model
    }
    catch (err) {
      syncErrors.value = { ...syncErrors.value, [id]: errorMessageFrom(err) ?? 'Download failed' }
      throw err
    }
    finally {
      downloadingIds.value = downloadingIds.value.filter(item => item !== id)
    }
  }

  /** Deletes the model from the account. Other devices drop their cached copy on their next sync. */
  async function deleteCloudDisplayModelById(id: string) {
    const cloud = cloudModels.value.find(model => model.id === id)
    if (!cloud)
      return
    await deleteCloudDisplayModel(id, cloud.revision)
    await removeDisplayModel(id)
    await refreshCloudModels()
  }

  async function activateCloudSync(userId: string) {
    cloudOwnerId.value = userId
    cloudDirectoryLoaded.value = false
    await transferQueue.activate(userId)
    await refreshCloudModels()
  }

  function deactivateCloudSync() {
    transferQueue.deactivate()
    cloudOwnerId.value = undefined
    cloudModels.value = []
    cloudDirectoryLoaded.value = false
    syncErrors.value = {}
  }

  async function initialize() {
    await import('@proj-airi/stage-ui-live2d/utils/live2d-zip-loader')
    await import('@proj-airi/stage-ui-live2d/utils/live2d-opfs-registration')

    const { loadLive2DModelPreview } = await import('@proj-airi/stage-ui-live2d/utils/live2d-preview')
    const { loadVrmModelPreview } = await import('@proj-airi/stage-ui-three/utils/vrm-preview')
    const { loadSpineModelPreview } = await import('@proj-airi/stage-ui-spine/utils/spine-preview')
    const { loadTachieModelPreview } = await import('@proj-airi/stage-ui-tachie/utils/tachie-preview')

    const authStore = useAuthStore()
    const featureFlagsStore = useFeatureFlagsStore()
    watch(
      () => authStore.isAuthenticated && featureFlagsStore.isEnabled(DISPLAY_MODEL_SYNC_FLAG.key) ? authStore.userId : undefined,
      (userId) => {
        deactivateCloudSync()
        if (userId)
          activateCloudSync(userId).catch(err => console.error('[display-models] failed to start cloud sync:', err))
      },
      { immediate: true },
    )

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
    cloudOnlyModels,
    syncStatuses,
    syncErrors,

    initialize,
    loadDisplayModelsFromIndexedDB,
    getDisplayModel,
    ensureDisplayModelAvailable,
    uploadDisplayModel,
    deleteCloudDisplayModel: deleteCloudDisplayModelById,
    addDisplayModel,
    renameDisplayModel,
    removeDisplayModel,
    resetDisplayModels,
  }
})
