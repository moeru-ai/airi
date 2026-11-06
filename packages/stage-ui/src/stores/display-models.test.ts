import type { Session, User } from 'better-auth'

import type { CloudDisplayModel } from '../services/display-model-sync'

import localforage from 'localforage'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TransferRequestError } from '../libs/file-transfer/request-error'
import { downloadVerified, putToTarget } from '../libs/file-transfer/transfer'
import { completeDisplayModelUpload, deleteCloudDisplayModel, listCloudDisplayModels, renameCloudDisplayModel, requestDisplayModelDownload, reserveDisplayModelUpload } from '../services/display-model-sync'
import { useAuthStore } from './auth'
import { useDisplayModelCloudStore } from './display-model-cloud'
import { DisplayModelFormat, useDisplayModelsStore } from './display-models'
import { useSettingsStageModel } from './settings/stage-model'
import { useSyncPreferencesStore } from './sync-preferences'

const storage = vi.hoisted(() => new Map<string, unknown>())

// IndexedDB returns a copy of each record, so a change is not visible until a write.
vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.has(key) ? { ...storage.get(key) as object } : null),
    iterate: vi.fn(async (callback: (value: unknown, key: string) => void) => {
      for (const [key, value] of storage)
        callback({ ...value as object }, key)
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key)
    }),
    setItem: vi.fn(async (key: string, value: unknown) => {
      storage.set(key, value)
      return value
    }),
  },
}))

const cloudModel: CloudDisplayModel = {
  id: 'display-model-cloud',
  format: 'live2d-zip',
  name: 'Cloud model',
  originalFilename: 'cloud.zip',
  byteSize: 5,
  sha256: 'checksum',
  revision: 1,
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z',
  deletedAt: null,
}

vi.mock('../services/display-model-sync', () => ({
  listCloudDisplayModels: vi.fn(),
  deleteCloudDisplayModel: vi.fn(async () => {}),
  requestDisplayModelDownload: vi.fn(async () => ({ url: 'https://storage.test/model.zip', byteSize: 5, sha256: 'checksum' })),
  renameCloudDisplayModel: vi.fn(),
  reserveDisplayModelUpload: vi.fn(),
  completeDisplayModelUpload: vi.fn(),
}))

vi.mock('../libs/file-transfer/transfer', () => ({
  downloadVerified: vi.fn(async () => new Blob(['model'])),
  putToTarget: vi.fn(async () => {}),
  sha256Hex: vi.fn(async () => 'checksum'),
}))

function signIn(id: string) {
  const user: User = { id, name: id, email: `${id}@example.test`, emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0) }
  const session: Session = { id: `session-${id}`, token: 'token', userId: id, expiresAt: new Date('2027-01-01T00:00:00.000Z'), createdAt: new Date(0), updatedAt: new Date(0) }
  const auth = useAuthStore()
  auth.user = user
  auth.session = session
}

/** Signs in, turns on model sync, and waits until the account directory is loaded. */
async function startCloudSync() {
  signIn('owner-a')
  useSyncPreferencesStore().setEnabled('display-models', true)
  const store = useDisplayModelsStore()
  // The preview renderers need `window` and fail to load in Node. Sync starts before they load.
  await expect(store.initialize()).rejects.toThrow('window is not defined')
  await vi.waitFor(() => expect(store.cloudModels).toHaveLength(1))
  return store
}

describe('display models store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    storage.clear()
    vi.mocked(listCloudDisplayModels).mockReset().mockResolvedValue([cloudModel])
    // Signing in refreshes Flux credits. Keep that request off the network.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves newly imported display models from memory before IndexedDB', async () => {
    const store = useDisplayModelsStore()
    const model = {
      id: 'display-model-pending-idb-write',
      format: DisplayModelFormat.Live2dZip,
      type: 'file' as const,
      file: new File(['model'], 'model.zip'),
      name: 'model.zip',
      importedAt: 1,
    }

    store.displayModels = [model]

    const resolved = await store.getDisplayModel(model.id)

    expect(resolved).toEqual(model)
  })

  it('downloads a cloud model once when two callers pick it at the same time', async () => {
    const store = await startCloudSync()

    const [first, second] = await Promise.all([
      store.ensureDisplayModelAvailable(cloudModel.id),
      store.ensureDisplayModelAvailable(cloudModel.id),
    ])

    expect(first).toBe(second)
    expect(first).toMatchObject({ cloudOwnerId: 'owner-a' })
    expect(requestDisplayModelDownload).toHaveBeenCalledTimes(1)
    expect(downloadVerified).toHaveBeenCalledTimes(1)
    expect(store.displayModels.filter(model => model.id === cloudModel.id)).toHaveLength(1)
  })

  it('drops a download when the account signs out before it finishes', async () => {
    vi.mocked(downloadVerified).mockImplementationOnce((_source, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason))
    }))
    const store = await startCloudSync()

    const download = store.ensureDisplayModelAvailable(cloudModel.id)
    await vi.waitFor(() => expect(downloadVerified).toHaveBeenCalledTimes(1))
    useAuthStore().user = null

    await expect(download).rejects.toThrow()
    expect(store.displayModels.some(model => model.id === cloudModel.id)).toBe(false)
    expect(localforage.setItem).not.toHaveBeenCalledWith(cloudModel.id, expect.anything())
    expect(store.syncErrors).toEqual({})
  })

  // https://github.com/moeru-ai/airi/pull/2458#discussion_r4276337637
  // ROOT CAUSE:
  //
  // The list hid models of other accounts, but a direct lookup did not. After
  // an account switch, a card could show another account's private model.
  //
  // We fixed this by applying the same account check to the direct lookup.
  it('hides a model that another account downloaded from a direct lookup', async () => {
    signIn('owner-b')
    const store = useDisplayModelsStore()
    vi.mocked(localforage.getItem).mockResolvedValueOnce({
      id: 'display-model-private',
      format: DisplayModelFormat.Live2dZip,
      type: 'file',
      file: new File(['model'], 'model.zip'),
      name: 'model.zip',
      importedAt: 1,
      cloudOwnerId: 'owner-a',
    })

    await expect(store.getDisplayModel('display-model-private')).resolves.toBeUndefined()
  })

  it('reports a model as deleted only when the account does not keep it', async () => {
    const store = await startCloudSync()
    const deleted = vi.fn()
    store.onDisplayModelsDeleted(deleted)

    await store.removeDisplayModel(cloudModel.id)
    await store.removeDisplayModel('display-model-local')

    expect(deleted.mock.calls).toEqual([[['display-model-local']]])
  })

  it('reports a model that is deleted from the account', async () => {
    const store = await startCloudSync()
    const deleted = vi.fn()
    store.onDisplayModelsDeleted(deleted)
    vi.mocked(listCloudDisplayModels)
      .mockResolvedValueOnce([{ ...cloudModel, revision: 2 }])
      .mockResolvedValue([{ ...cloudModel, revision: 3, deletedAt: '2026-10-15T00:00:00.000Z' }])

    await store.deleteCloudDisplayModel(cloudModel.id)

    // The first run reads the revision that another device can have changed.
    expect(deleteCloudDisplayModel).toHaveBeenCalledWith(cloudModel.id, 2)
    expect(deleted).toHaveBeenCalledWith([cloudModel.id])
    expect(store.cloudModels).toEqual([])
  })

  it('loads stored models once when several callers initialize at the same time', async () => {
    const store = useDisplayModelsStore()

    await Promise.all([
      store.loadDisplayModelsFromIndexedDB(),
      store.loadDisplayModelsFromIndexedDB(),
      store.loadDisplayModelsFromIndexedDB(),
    ])

    expect(localforage.iterate).toHaveBeenCalledTimes(1)
  })

  describe('reconciliation', () => {
    const modelId = 'display-model-x'
    const directoryEntry = (overrides: Partial<CloudDisplayModel> = {}): CloudDisplayModel => ({ ...cloudModel, id: modelId, format: 'vrm', name: 'x.vrm', originalFilename: 'x.vrm', ...overrides })
    const record = (overrides = {}) => ({ id: modelId, format: DisplayModelFormat.VRM, type: 'file', file: new File(['m'], 'x.vrm'), name: 'x.vrm', importedAt: 1, ...overrides })
    const target = (uploadId: string) => ({ uploadId, method: 'PUT' as const, url: `https://storage.test/${uploadId}`, headers: {} })
    const flush = () => new Promise(resolve => setTimeout(resolve, 20))

    async function startWithModel(overrides = {}, directory: CloudDisplayModel[] = []) {
      storage.set(modelId, record(overrides))
      vi.mocked(listCloudDisplayModels).mockResolvedValue(directory)
      signIn('owner-a')
      useSyncPreferencesStore().setEnabled('display-models', true)
      const store = useDisplayModelsStore()
      await store.initialize().catch(() => {})
      await vi.waitFor(() => expect(useDisplayModelCloudStore().directoryLoaded).toBe(true))
      await store.loadDisplayModelsFromIndexedDB()
      return store
    }

    // ROOT CAUSE:
    //
    // A retry sent the request id of the failed attempt, and the server returned its session.
    // The object key of that session already held the bytes, so the write-once PUT failed with 412.
    // An expired or aborted session failed in the same way, so no retry could ever finish.
    //
    // We fixed this by reserving a new session for each attempt.
    it('finishes an upload after the upload was written and its completion failed', async () => {
      const store = await startWithModel()
      vi.mocked(reserveDisplayModelUpload).mockImplementation(async input => target(input.requestId))
      const written = new Set<string>()
      vi.mocked(putToTarget).mockImplementation(async (_blob, uploadTarget) => {
        if (written.has(uploadTarget.url))
          throw new Error('Upload failed with status 412')
        written.add(uploadTarget.url)
      })
      vi.mocked(completeDisplayModelUpload).mockRejectedValueOnce(new Error('network')).mockResolvedValue(directoryEntry())

      await store.uploadDisplayModel(modelId)
      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('failed'))
      vi.mocked(listCloudDisplayModels).mockResolvedValue([directoryEntry()])
      await store.uploadDisplayModel(modelId)

      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('synced'))
      expect(completeDisplayModelUpload).toHaveBeenCalledTimes(2)
      expect(store.syncErrors).toEqual({})
    })

    it('runs a failed upload again on the next synchronization, except after a permanent refusal', async () => {
      const store = await startWithModel()
      vi.mocked(reserveDisplayModelUpload).mockRejectedValueOnce(new Error('network')).mockResolvedValue(null)

      await store.uploadDisplayModel(modelId)
      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('failed'))
      vi.mocked(listCloudDisplayModels).mockResolvedValue([directoryEntry()])
      await store.refreshCloudModels()
      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('synced'))

      expect(reserveDisplayModelUpload).toHaveBeenCalledTimes(2)
    })

    it('does not upload again in the background after a full quota', async () => {
      const store = await startWithModel()
      vi.mocked(reserveDisplayModelUpload).mockRejectedValue(new TransferRequestError(402, 'The quota is full'))

      await store.uploadDisplayModel(modelId)
      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('failed'))
      await store.refreshCloudModels()
      await flush()

      expect(reserveDisplayModelUpload).toHaveBeenCalledTimes(1)
      expect(store.syncStatuses[modelId]).toBe('failed')
    })

    it('does not fail a finished upload when the next directory read fails', async () => {
      const store = await startWithModel()
      vi.mocked(reserveDisplayModelUpload).mockResolvedValue(null)
      vi.mocked(listCloudDisplayModels).mockRejectedValue(new Error('flaky'))

      await store.uploadDisplayModel(modelId)
      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('synced'))
    })

    it('uploads a record from an earlier release with its file name', async () => {
      const store = await startWithModel({ id: undefined, type: undefined, name: undefined })
      vi.mocked(reserveDisplayModelUpload).mockResolvedValue(null)

      await store.uploadDisplayModel(modelId)
      await vi.waitFor(() => expect(reserveDisplayModelUpload).toHaveBeenCalled())

      expect(vi.mocked(reserveDisplayModelUpload).mock.calls[0][0].name).toBe('x.vrm')
      await flush()
      expect(storage.has('undefined')).toBe(false)
    })

    it('keeps a rename during an upload and sends it to the account', async () => {
      const store = await startWithModel()
      let finishReservation = (_: null) => {}
      vi.mocked(reserveDisplayModelUpload).mockImplementation(() => new Promise((resolve) => {
        finishReservation = resolve
      }))
      vi.mocked(renameCloudDisplayModel).mockResolvedValue(directoryEntry({ name: 'renamed', revision: 2 }))

      await store.uploadDisplayModel(modelId)
      await vi.waitFor(() => expect(reserveDisplayModelUpload).toHaveBeenCalled())
      await store.renameDisplayModel(modelId, 'renamed')
      vi.mocked(listCloudDisplayModels).mockResolvedValue([directoryEntry()])
      finishReservation(null)

      await vi.waitFor(() => expect(renameCloudDisplayModel).toHaveBeenCalledWith(modelId, 'renamed', 1, expect.anything()))
      await vi.waitFor(() => expect(storage.get(modelId)).toMatchObject({ name: 'renamed', syncedName: 'renamed' }))
      await vi.waitFor(() => expect(store.displayModels.find(model => model.id === modelId)?.name).toBe('renamed'))
    })

    it('applies a rename from another device to the local copy', async () => {
      const store = await startWithModel({ name: 'old', syncedName: 'old', cloudOwnerId: 'owner-a' }, [directoryEntry({ name: 'new' })])

      await vi.waitFor(() => expect(store.displayModels.find(model => model.id === modelId)?.name).toBe('new'))
      expect(renameCloudDisplayModel).not.toHaveBeenCalled()
    })

    it('takes the account name when both sides renamed the model', async () => {
      const store = await startWithModel({ name: 'local', syncedName: 'old', cloudOwnerId: 'owner-a' }, [directoryEntry({ name: 'remote' })])

      await vi.waitFor(() => expect(store.displayModels.find(model => model.id === modelId)?.name).toBe('remote'))
      expect(renameCloudDisplayModel).not.toHaveBeenCalled()
    })

    it('keeps the local name and reports a rename that the account refuses', async () => {
      vi.mocked(renameCloudDisplayModel).mockRejectedValue(new Error('offline'))
      const store = await startWithModel({ name: 'local', syncedName: 'old', cloudOwnerId: 'owner-a' }, [directoryEntry({ name: 'old' })])

      await vi.waitFor(() => expect(store.syncErrors[modelId]).toBe('offline'))
      expect(store.displayModels.find(model => model.id === modelId)?.name).toBe('local')
    })

    it('removes a local copy after a deletion on another device', async () => {
      const store = await startWithModel({ cloudOwnerId: 'owner-a' }, [directoryEntry({ deletedAt: '2026-10-15T00:00:00.000Z' })])

      await vi.waitFor(() => expect(store.displayModels.some(model => model.id === modelId)).toBe(false))
      expect(storage.has(modelId)).toBe(false)
    })

    it('reads the directory again after a failed first read', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        vi.mocked(listCloudDisplayModels).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([directoryEntry()])
        signIn('owner-a')
        useSyncPreferencesStore().setEnabled('display-models', true)
        const store = useDisplayModelsStore()
        store.initialize().catch(() => {})

        await vi.advanceTimersByTimeAsync(30_000)

        expect(listCloudDisplayModels).toHaveBeenCalledTimes(2)
        expect(store.cloudModels).toHaveLength(1)
      }
      finally {
        vi.useRealTimers()
      }
    })

    it('loads the selected model after a sign-in makes it available', async () => {
      const stage = useSettingsStageModel()
      stage.stageModelSelected = modelId
      await vi.waitFor(() => expect(stage.stageModelUnavailable).toBe(true))

      await startWithModel({ cloudOwnerId: 'owner-a' }, [directoryEntry()])

      await vi.waitFor(() => expect(stage.stageModelUnavailable).toBe(false))
      expect(stage.stageModelSelectedDisplayModel?.id).toBe(modelId)
    })

    it('waits for the first directory read before it reports a selected model as missing', async () => {
      let answerList = (_: CloudDisplayModel[]) => {}
      vi.mocked(listCloudDisplayModels).mockImplementation(() => new Promise((resolve) => {
        answerList = resolve
      }))
      signIn('owner-a')
      useSyncPreferencesStore().setEnabled('display-models', true)
      const store = useDisplayModelsStore()
      store.initialize().catch(() => {})

      const available = store.ensureDisplayModelAvailable(cloudModel.id)
      await vi.waitFor(() => expect(listCloudDisplayModels).toHaveBeenCalled())
      answerList([cloudModel])

      await expect(available).resolves.toMatchObject({ id: cloudModel.id })
    })

    it('hides the private copy of the previous account after an account switch', async () => {
      const store = await startWithModel({ cloudOwnerId: 'owner-a' }, [directoryEntry()])
      expect(store.displayModels.some(model => model.id === modelId)).toBe(true)

      signIn('owner-b')

      await vi.waitFor(() => expect(store.displayModels.some(model => model.id === modelId)).toBe(false))
      await expect(store.getDisplayModel(modelId)).resolves.toBeUndefined()
    })

    it('stops reporting a model as cloud-only after another window stored it', async () => {
      const store = await startWithModel({}, [directoryEntry()])
      storage.delete(modelId)
      await store.loadDisplayModelsFromIndexedDB()
      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('cloud-only'))

      storage.set(modelId, record({ cloudOwnerId: 'owner-a' }))
      await store.ensureDisplayModelAvailable(modelId)

      expect(store.syncStatuses[modelId]).toBe('synced')
    })

    // https://github.com/moeru-ai/airi/pull/3343
    // ROOT CAUSE:
    //
    // The account watcher only queued a run, and a directory request can hold the active run.
    // Meanwhile an upload of the previous account sent its next request with the new token.
    //
    // We fixed this by stopping the queue in the same task as the account change.
    it('aborts an upload in the task of an account change, during an active run', async () => {
      const store = await startWithModel()
      let uploadSignal: AbortSignal | undefined
      vi.mocked(reserveDisplayModelUpload).mockImplementation((_input, signal) => {
        uploadSignal = signal
        return new Promise(() => {})
      })
      await store.uploadDisplayModel(modelId)
      await vi.waitFor(() => expect(uploadSignal).toBeDefined())
      vi.mocked(listCloudDisplayModels).mockImplementation(() => new Promise(() => {}))
      void store.refreshCloudModels()
      await vi.waitFor(() => expect(listCloudDisplayModels).toHaveBeenCalled())

      signIn('owner-b')

      expect(uploadSignal?.aborted).toBe(true)
    })

    // The queue action can wait for a run, and the session can change before it continues.
    it('does not queue a file of one account for another account', async () => {
      await startWithModel()
      signIn('owner-b')

      await useDisplayModelCloudStore().queueUpload(modelId, 'owner-a')
      await flush()

      expect(reserveDisplayModelUpload).not.toHaveBeenCalled()
      expect(useDisplayModelCloudStore().uploads).toEqual({})
    })

    it('clears the directory of the previous account after a sign-out', async () => {
      const store = await startWithModel({}, [directoryEntry()])
      expect(store.cloudModels).toHaveLength(1)

      useAuthStore().user = null

      await vi.waitFor(() => expect(store.cloudModels).toEqual([]))
      expect(store.cloudOnlyModels).toEqual([])
      expect(useDisplayModelCloudStore().ownerId).toBeUndefined()
    })

    it('runs an upload again after its session expired', async () => {
      const store = await startWithModel()
      vi.mocked(reserveDisplayModelUpload)
        .mockRejectedValueOnce(new TransferRequestError(410, 'expired'))
        .mockResolvedValue(null)

      await store.uploadDisplayModel(modelId)
      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('failed'))
      vi.mocked(listCloudDisplayModels).mockResolvedValue([directoryEntry()])
      await store.refreshCloudModels()

      await vi.waitFor(() => expect(store.syncStatuses[modelId]).toBe('synced'))
    })

    // ROOT CAUSE:
    //
    // A removal reported a model as deleted unless the loaded directory listed it. With sync off,
    // after sign-out, or before the first read, the directory is empty, so a card lost its reference
    // to a model that the account still keeps.
    //
    // We fixed this by treating a copy that came from the account as kept by the account.
    it('keeps card references when it removes a copy of an account model with sync off', async () => {
      storage.set(modelId, record({ cloudOwnerId: 'owner-a' }))
      const store = useDisplayModelsStore()
      await store.loadDisplayModelsFromIndexedDB()
      const deleted = vi.fn()
      store.onDisplayModelsDeleted(deleted)

      await store.removeDisplayModel(modelId)

      expect(deleted).not.toHaveBeenCalled()
      expect(storage.has(modelId)).toBe(false)
    })
  })
})
