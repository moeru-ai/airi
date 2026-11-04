import type { Session, User } from 'better-auth'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import localforage from 'localforage'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useAuthStore } from './auth'
import { DisplayModelFormat, useDisplayModelsStore } from './display-models'
import { useSyncPreferencesStore } from './sync-preferences'

const modelId = 'display-model-window-test'
const runtimes: SyncedPiniaRuntime[] = []
const pinias: ReturnType<typeof createPinia>[] = []

function directoryEntry(name: string) {
  return { id: modelId, format: 'vrm', name, originalFilename: 'x.vrm', byteSize: 1, sha256: 'a'.repeat(64), revision: 1, createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', deletedAt: null }
}

/** A network boundary. Each request records its route, so a test can count the uploads. */
function createFakeServer() {
  const state = { directory: [] as ReturnType<typeof directoryEntry>[], reservations: 0, reservationSignal: undefined as AbortSignal | undefined, holdReservation: undefined as Promise<void> | undefined }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/uploads') && init?.method === 'POST') {
      state.reservations++
      state.reservationSignal = init.signal ?? undefined
      await state.holdReservation
      return Response.json({ upload: null })
    }
    if (url.includes('/display-models'))
      return Response.json({ models: state.directory })
    // The answer of a new sign-in stays pending, so `user` still names the previous account.
    if (url.includes('/get-session'))
      return new Promise<Response>(() => {})
    return Response.json({})
  }))
  return state
}

async function openWindow(runtime: SyncedPiniaRuntime) {
  const pinia = createPinia()
  runtimes.push(runtime)
  pinia.use(runtime.plugin)
  createApp({}).use(pinia).use(PiniaColada)
  setActivePinia(pinia)
  pinias.push(pinia)

  const user: User = { id: 'owner-a', name: 'a', email: 'a@example.test', emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0) }
  const session: Session = { id: 'session', token: 'token', userId: 'owner-a', expiresAt: new Date('2099-01-01'), createdAt: new Date(0), updatedAt: new Date(0) }
  const auth = useAuthStore(pinia)
  auth.user = user
  auth.session = session
  useSyncPreferencesStore(pinia).setEnabled('display-models', true)

  const store = useDisplayModelsStore(pinia)
  await store.initialize().catch(() => {})
  await store.loadDisplayModelsFromIndexedDB()
  return store
}

describe('display model sync across windows', () => {
  let namespace: string

  beforeEach(async () => {
    namespace = `display-model-sync-${crypto.randomUUID()}`
    await localforage.clear()
  })

  afterEach(async () => {
    for (const pinia of pinias.splice(0))
      disposePinia(pinia)
    for (const runtime of runtimes.splice(0))
      runtime.dispose()
    vi.unstubAllGlobals()
    await localforage.clear()
  })

  // ROOT CAUSE:
  //
  // Each window that started sync loaded the persisted tasks and ran them. Opening the settings
  // window during an upload started a second upload of the same file.
  //
  // We fixed this by running the queue only in the leader.
  it('uploads a persisted task once when a second window opens', async () => {
    const server = createFakeServer()
    let release = () => {}
    server.holdReservation = new Promise((resolve) => {
      release = resolve
    })
    await localforage.setItem(modelId, { id: modelId, format: DisplayModelFormat.VRM, type: 'file', file: new File(['m'], 'x.vrm'), name: 'x.vrm', importedAt: 1 })
    await localforage.setItem(`transfer-task-${modelId}`, { id: modelId, kind: 'upload-display-model', ownerId: 'owner-a', payload: { modelId }, status: 'queued' })

    const leader = await openWindow(createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' }))
    await vi.waitFor(() => expect(server.reservations).toBe(1))
    const follower = await openWindow(createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' }))

    // The follower reports the upload of the leader, and starts none.
    await vi.waitFor(() => expect(follower.syncStatuses[modelId]).toBe('uploading'))
    expect(server.reservations).toBe(1)

    server.directory = [directoryEntry('x.vrm')]
    release()
    await vi.waitFor(() => expect(leader.syncStatuses[modelId]).toBe('synced'))
    await vi.waitFor(() => expect(follower.syncStatuses[modelId]).toBe('synced'))
    expect(server.reservations).toBe(1)
  })

  // `completeSignIn` replaces the token first. `user` still names the previous account until the session request answers.
  it('aborts an upload and starts no other while a new sign-in has no verified user', async () => {
    const server = createFakeServer()
    server.holdReservation = new Promise(() => {})
    await localforage.setItem(modelId, { id: modelId, format: DisplayModelFormat.VRM, type: 'file', file: new File(['m'], 'x.vrm'), name: 'x.vrm', importedAt: 1 })
    await localforage.setItem(`transfer-task-${modelId}`, { id: modelId, kind: 'upload-display-model', ownerId: 'owner-a', payload: { modelId }, status: 'queued' })
    const store = await openWindow(createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' }))
    await vi.waitFor(() => expect(server.reservations).toBe(1))

    // The session answer never arrives, so the runtime rejects this call during teardown.
    void useAuthStore(pinias[0]).completeSignIn({ accessToken: 'token-b', refreshToken: 'refresh-b', idToken: 'id-b', clientId: 'client', expiresIn: 3600 }).catch(() => {})

    await expect.poll(() => server.reservationSignal?.aborted).toBe(true)
    await store.refreshCloudModels()
    expect(server.reservations).toBe(1)
    expect(store.syncStatuses).toEqual({})
    expect(store.cloudModels).toEqual([])
  })

  it('resumes a persisted upload in the window that becomes the leader', async () => {
    const server = createFakeServer()
    server.holdReservation = new Promise(() => {})
    await localforage.setItem(modelId, { id: modelId, format: DisplayModelFormat.VRM, type: 'file', file: new File(['m'], 'x.vrm'), name: 'x.vrm', importedAt: 1 })
    await localforage.setItem(`transfer-task-${modelId}`, { id: modelId, kind: 'upload-display-model', ownerId: 'owner-a', payload: { modelId }, status: 'queued' })

    const firstRuntime = createSyncedPiniaPlugin({ namespace })
    await openWindow(firstRuntime)
    const firstPinia = pinias[0]
    await vi.waitFor(() => expect(server.reservations).toBe(1))
    const secondRuntime = createSyncedPiniaPlugin({ namespace })
    const second = await openWindow(secondRuntime)
    await vi.waitFor(() => expect(second.syncStatuses[modelId]).toBe('uploading'))

    pinias.shift()
    disposePinia(firstPinia)
    runtimes.shift()
    firstRuntime.dispose()

    await vi.waitFor(async () => {
      await second.refreshCloudModels()
      expect(server.reservations).toBe(2)
    }, { timeout: 10_000, interval: 200 })
  }, 20_000)

  it('shows a file that one window stored in the other window', async () => {
    const server = createFakeServer()
    server.directory = [directoryEntry('x.vrm')]
    const leader = await openWindow(createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' }))
    const follower = await openWindow(createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' }))
    await vi.waitFor(() => expect(follower.syncStatuses[modelId]).toBe('cloud-only'))

    await follower.addDisplayModel(DisplayModelFormat.PMD, new File(['pmd'], 'imported.pmd'))

    await vi.waitFor(() => expect(leader.displayModels.some(model => model.name === 'imported.pmd')).toBe(true))
    const imported = leader.displayModels.find(model => model.name === 'imported.pmd')
    expect(imported?.type === 'file' && await imported.file.text()).toBe('pmd')
  })

  it('sends a rename from a follower window once', async () => {
    const server = createFakeServer()
    server.directory = [directoryEntry('x.vrm')]
    await localforage.setItem(modelId, { id: modelId, format: DisplayModelFormat.VRM, type: 'file', file: new File(['m'], 'x.vrm'), name: 'x.vrm', importedAt: 1, cloudOwnerId: 'owner-a', syncedName: 'x.vrm' })
    const leader = await openWindow(createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' }))
    const follower = await openWindow(createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' }))
    await vi.waitFor(() => expect(follower.syncStatuses[modelId]).toBe('synced'))

    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'PATCH') {
        server.directory = [directoryEntry('renamed')]
        return Response.json(directoryEntry('renamed'))
      }
      return String(input).includes('/display-models') ? Response.json({ models: server.directory }) : Response.json({})
    })
    await follower.renameDisplayModel(modelId, 'renamed')

    await vi.waitFor(() => expect(leader.displayModels.find(model => model.id === modelId)?.name).toBe('renamed'))
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1)
  })
})
