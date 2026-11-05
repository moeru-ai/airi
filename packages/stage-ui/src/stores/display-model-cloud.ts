import type { Pinia } from 'pinia'
import type { EffectScope } from 'vue'

import type { TransferTask } from '../libs/file-transfer/transfer-queue'
import type { CloudDisplayModel } from '../services/display-model-sync'
import type { DisplayModelFile } from './display-models'

import { errorMessageFrom } from '@moeru/std'
import { createEventHook } from '@vueuse/core'
import { isEqual } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore, getActivePinia } from 'pinia'
import { effectScope, onScopeDispose, ref, watch } from 'vue'

import * as v from 'valibot'

import { displayModelsRepo } from '../database/repos/display-models.repo'
import { isPermanentTransferFailure } from '../libs/file-transfer/request-error'
import { putToTarget, sha256Hex } from '../libs/file-transfer/transfer'
import { TransferQueue } from '../libs/file-transfer/transfer-queue'
import { SyncRunner, watchSyncTriggers } from '../libs/sync-runner'
import {
  completeDisplayModelUpload,
  deleteCloudDisplayModel,
  listCloudDisplayModels,
  renameCloudDisplayModel,
  reserveDisplayModelUpload,
} from '../services/display-model-sync'
import { useAuthStore } from './auth'
import { useSyncPreferencesStore } from './sync-preferences'

const uploadTaskKind = 'upload-display-model'
const UploadPayloadSchema = v.object({ modelId: v.string() })

/** A request without a response must not block all later runs. */
const METADATA_REQUEST_TIMEOUT_MS = 10_000
/** Another device can add a model while this window has focus and stays visible. */
const POLL_INTERVAL_MS = 10 * 60 * 1000

/**
 * The account that sync runs for in this window. Undefined when no account is signed in, the feature is off,
 * or the token can belong to another account during a sign-in. `authedFetch` sends the current token,
 * so a request made in that state can write the files of one account into another.
 */
export function resolveCloudOwnerId(pinia?: Pinia) {
  const auth = useAuthStore(pinia)
  return auth.isAuthenticated && auth.isSessionVerified && useSyncPreferencesStore(pinia).isEnabled('display-models') ? auth.userId : undefined
}

/**
 * The account directory of display models, and the upload queue that fills it.
 *
 * The leader window owns the queue and runs the reconciliation. Every window reads the state.
 * Local files stay out of the state: `localRevision` tells each window to read them again.
 * Downloads run in the window that needs the file, because a leader-routed call rejects after 30 seconds.
 *
 * Each run compares the directory with the local copies, so a failed run loses nothing:
 * - A deletion marker removes the local copy.
 * - A name follows the side that changed it. `syncedName` is the common base.
 *   If both sides changed it, the account value wins, as in `libs/document-sync`.
 * - A failed upload runs again, except after a refusal that a retry cannot change.
 */
export const useDisplayModelCloudStore = defineStore('display-model-cloud', () => {
  const pinia = getActivePinia()
  // Written only in the leader.
  const ownerId = ref<string>()
  const models = ref<CloudDisplayModel[]>([])
  const directoryLoaded = ref(false)
  const uploads = ref<Record<string, TransferTask['status']>>({})
  const errors = ref<Record<string, string>>({})
  /** Increases after a local file changes. Each window reads the files again. */
  const localRevision = ref(0)
  /** Increases after each run that reached the server. A window retries a model that it could not load. */
  const completedRuns = ref(0)

  // Reports IDs that the account deleted. It fires only in the leader.
  const modelsDeleted = createEventHook<[deletedIds: string[]]>()

  const transferQueue = new TransferQueue(
    { [uploadTaskKind]: runUploadTask },
    {
      save: task => displayModelsRepo.saveUpload(task),
      remove: id => displayModelsRepo.removeUpload(id),
      list: () => displayModelsRepo.listUploads(),
    },
    (task, removed) => {
      const { [task.id]: _previous, ...rest } = uploads.value
      uploads.value = removed ? rest : { ...rest, [task.id]: task.status }
      if (task.status === 'failed' && !removed)
        setError(task.id, task.error ?? 'Upload failed')
    },
    error => !isPermanentTransferFailure(error),
  )

  const runner = new SyncRunner(reconcile, {
    onError: error => console.error('[display-models] Synchronization failed:', errorMessageFrom(error)),
  })

  // The account of the queue in this window. It is not state: `ownerId` replicates to a new leader,
  // whose queue still has to start and load the persisted tasks.
  let queueOwnerId: string | undefined
  let stopOwnerGuard: (() => void) | undefined
  let triggers: EffectScope | undefined
  let disposed = false
  onScopeDispose(() => {
    disposed = true
    stopOwnerGuard?.()
    triggers?.stop()
    runner.dispose()
    transferQueue.deactivate()
  })

  function setError(id: string, message: string) {
    errors.value = { ...errors.value, [id]: message }
  }

  function clearError(id: string) {
    if (!(id in errors.value))
      return
    const { [id]: _cleared, ...rest } = errors.value
    errors.value = rest
  }

  /**
   * Stops the queue in the same task as an account change. A queued run comes too late, because
   * an active upload sends its next request with the token of the new account.
   * Only the window that owns the queue installs this, so the state writes stay in the leader.
   */
  function guardQueueOwner(owner: string) {
    stopOwnerGuard?.()
    stopOwnerGuard = watch(() => resolveCloudOwnerId(pinia), (current) => {
      if (current === owner)
        return
      stopOwnerGuard?.()
      stopOwnerGuard = undefined
      queueOwnerId = undefined
      transferQueue.deactivate()
    }, { flush: 'sync' })
  }

  async function switchOwner(next: string | undefined) {
    stopOwnerGuard?.()
    stopOwnerGuard = undefined
    transferQueue.deactivate()
    queueOwnerId = next
    // A new leader of the same account keeps the replicated directory.
    if (ownerId.value !== next) {
      ownerId.value = next
      models.value = []
      directoryLoaded.value = false
      errors.value = {}
    }
    if (next) {
      guardQueueOwner(next)
      await transferQueue.activate(next)
    }
  }

  async function reconcile() {
    const owner = resolveCloudOwnerId(pinia)
    // Compare both. The guard clears only the queue owner, and the replicated directory of the previous account must go too.
    if (owner !== queueOwnerId || owner !== ownerId.value)
      await switchOwner(owner)
    if (!owner)
      return

    const listed = await listCloudDisplayModels(AbortSignal.timeout(METADATA_REQUEST_TIMEOUT_MS))
    // The account changed during the request. The trigger of that change queues a run for the new account.
    if (disposed || resolveCloudOwnerId(pinia) !== owner)
      return

    const live = listed.filter(model => !model.deletedAt)
    if (!isEqual(live, models.value))
      models.value = live
    directoryLoaded.value = true

    const deletedIds = listed.filter(model => model.deletedAt).map(model => model.id)
    await reconcileLocalCopies(owner, new Set(deletedIds))
    await transferQueue.retryFailed()
    completedRuns.value++

    // The server keeps deletion markers, so each run reports them again. Removing a
    // reference that is already gone changes nothing.
    if (deletedIds.length > 0)
      await modelsDeleted.trigger(deletedIds)
  }

  async function reconcileLocalCopies(owner: string, deletedIds: Set<string>) {
    let changed = false
    for (const record of await displayModelsRepo.list()) {
      // The account changed during this run. A rename would go out with the token of the new account.
      if (resolveCloudOwnerId(pinia) !== owner)
        return
      if (record.cloudOwnerId !== owner)
        continue

      if (deletedIds.has(record.id)) {
        await transferQueue.cancel(record.id)
        await displayModelsRepo.remove(record.id)
        changed = true
        continue
      }

      const cloud = models.value.find(model => model.id === record.id)
      if (cloud && await reconcileName(record, cloud))
        changed = true
    }
    if (changed)
      localRevision.value++
  }

  /** Returns true when the local record changed. */
  async function reconcileName(record: DisplayModelFile, cloud: CloudDisplayModel) {
    if (record.name === cloud.name) {
      clearError(record.id)
      if (record.syncedName === cloud.name)
        return false
      await displayModelsRepo.save({ ...record, syncedName: cloud.name })
      return false
    }

    const localChanged = record.syncedName !== undefined && record.name !== record.syncedName
    const cloudChanged = record.syncedName === undefined || cloud.name !== record.syncedName
    if (!localChanged || cloudChanged) {
      clearError(record.id)
      await displayModelsRepo.save({ ...record, name: cloud.name, syncedName: cloud.name })
      return true
    }

    try {
      const renamed = await renameCloudDisplayModel(record.id, record.name, cloud.revision, AbortSignal.timeout(METADATA_REQUEST_TIMEOUT_MS))
      models.value = models.value.map(model => model.id === renamed.id ? renamed : model)
      clearError(record.id)
      // The user can rename again during the request. Only the server can change the sent name, for example by trimming it.
      const latest = await displayModelsRepo.get(record.id)
      if (!latest)
        return false
      await displayModelsRepo.save({ ...latest, name: latest.name === record.name ? renamed.name : latest.name, syncedName: renamed.name })
      return true
    }
    catch (error) {
      // The local name stays. The next run compares the names again.
      setError(record.id, errorMessageFrom(error) ?? 'Rename failed')
      return false
    }
  }

  async function runUploadTask(task: TransferTask, signal: AbortSignal) {
    const { modelId } = v.parse(UploadPayloadSchema, task.payload)
    const record = await displayModelsRepo.get(modelId)
    // The model was removed from this device before its turn. Nothing is left to upload.
    if (!record)
      return

    // Each attempt reserves a new session. The server returns the session of a known request id
    // as it is, and an expired, aborted, or already written session cannot complete again.
    const upload = await reserveDisplayModelUpload({
      id: modelId,
      requestId: nanoid(),
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
    // Read again, because the user can rename the model during the upload. The next run sends that name.
    const latest = await displayModelsRepo.get(modelId)
    if (!latest)
      return
    await displayModelsRepo.save({ ...latest, cloudOwnerId: task.ownerId, syncedName: record.name })
    localRevision.value++
    clearError(modelId)
    await runner.request()
  }

  /** Compares the directory with the local copies. Resolves after the run, and logs a failure. */
  async function synchronize() {
    await runner.request()
  }

  /**
   * Queues a local model for upload. Calling it again after a failure retries the upload.
   * The caller names the account that requested the upload. The session can change while
   * this action waits for a run, and the queue must not take the file for another account.
   */
  async function queueUpload(id: string, requestedOwnerId: string) {
    if (queueOwnerId !== requestedOwnerId)
      await runner.request()
    if (queueOwnerId !== requestedOwnerId)
      return

    if (uploads.value[id] === 'failed') {
      clearError(id)
      await transferQueue.retry(id)
      return
    }
    if (uploads.value[id])
      return
    await transferQueue.enqueue({ id, kind: uploadTaskKind, payload: { modelId: id } })
  }

  async function cancelUpload(id: string) {
    await transferQueue.cancel(id)
  }

  /** Deletes the model from the account. Other devices drop their copy on their next run. */
  async function deleteModel(id: string) {
    // Another device can have renamed the model. A stale revision is refused.
    await runner.request()
    const cloud = models.value.find(model => model.id === id)
    if (!cloud)
      return

    await deleteCloudDisplayModel(id, cloud.revision)
    await transferQueue.cancel(id)
    await displayModelsRepo.remove(id)
    localRevision.value++
    await modelsDeleted.trigger([id])
    await runner.request()
  }

  async function announceLocalChange() {
    localRevision.value++
  }

  /**
   * Starts the triggers of this window. A second call changes nothing.
   * Every window that shows models calls it, and the action routes each request to the leader.
   */
  function start() {
    if (triggers || disposed)
      return

    triggers = effectScope(true)
    triggers.run(() => {
      watchSyncTriggers(async () => {
        try {
          await useDisplayModelCloudStore(pinia).synchronize()
        }
        catch (error) {
          console.error('[display-models] Failed to request synchronization:', errorMessageFrom(error))
        }
      }, {
        sources: [() => resolveCloudOwnerId(pinia)],
        pollIntervalMs: POLL_INTERVAL_MS,
      })
    })
  }

  return {
    ownerId,
    models,
    directoryLoaded,
    uploads,
    errors,
    localRevision,
    completedRuns,

    start,
    synchronize,
    queueUpload,
    cancelUpload,
    deleteModel,
    announceLocalChange,
    onModelsDeleted: modelsDeleted.on,
  }
}, {
  synced: {
    actions: ['synchronize', 'queueUpload', 'cancelUpload', 'deleteModel', 'announceLocalChange'],
    state: true,
  },
})
