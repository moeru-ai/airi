import type { Session, User } from 'better-auth'

import type { CloudDisplayModel } from '../services/display-model-sync'

import localforage from 'localforage'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DISPLAY_MODEL_SYNC_FLAG } from '../libs/feature-flags'
import { downloadVerified } from '../libs/file-transfer/transfer'
import { listCloudDisplayModels, requestDisplayModelDownload } from '../services/display-model-sync'
import { useAuthStore } from './auth'
import { DisplayModelFormat, useDisplayModelsStore } from './display-models'
import { useFeatureFlagsStore } from './feature-flags'

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async (_key: string, value: unknown) => value),
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
  listCloudDisplayModels: vi.fn(async () => [cloudModel]),
  deleteCloudDisplayModel: vi.fn(async () => {}),
  requestDisplayModelDownload: vi.fn(async () => ({ url: 'https://storage.test/model.zip', byteSize: 5, sha256: 'checksum' })),
}))

vi.mock('../libs/file-transfer/transfer', () => ({
  downloadVerified: vi.fn(async () => new Blob(['model'])),
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
  useFeatureFlagsStore().setPreference(DISPLAY_MODEL_SYNC_FLAG.key, true)
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
    vi.mocked(listCloudDisplayModels).mockResolvedValueOnce([{ ...cloudModel, deletedAt: '2026-10-15T00:00:00.000Z' }])

    await store.deleteCloudDisplayModel(cloudModel.id)

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
})
