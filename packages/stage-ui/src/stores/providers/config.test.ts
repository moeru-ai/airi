import type { InferenceServiceProvider } from '../../libs/providers/types'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useProviderConfigStore } from './config'

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const { authState, mocks } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: false,
  },
  mocks: {
    client: {},
    service: {
      listRemote: vi.fn(),
      upsertRemote: vi.fn(),
      deleteRemote: vi.fn(),
    },
  },
}))

vi.mock('../../composables/api', () => ({ client: mocks.client }))
vi.mock('../../services/inference-service-providers', () => ({
  inferenceServiceProvidersService: mocks.service,
}))
vi.mock('../auth', () => ({
  useAuthStore: () => ({
    get isAuthenticated() {
      return authState.isAuthenticated
    },
    onAuthenticated: (hook: () => void) => {
      if (authState.isAuthenticated)
        hook()
      return () => {}
    },
  }),
}))
vi.mock('../../libs/providers', () => ({
  getDefinedProvider: vi.fn(() => ({ id: 'openai-compatible', name: 'OpenAI Compatible' })),
}))

const localProvider = {
  id: 'local-provider',
  definitionId: 'openai-compatible',
  config: { apiKey: 'sk-local' },
  status: 'unconfigured',
  configuredBy: 'user',
} satisfies InferenceServiceProvider

const officialProvider = {
  id: 'official-provider',
  definitionId: 'official-provider',
  config: {},
  status: 'configured',
  configuredBy: 'authentication',
} satisfies InferenceServiceProvider

function installStore() {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  return useProviderConfigStore()
}

describe('provider config store', () => {
  beforeEach(() => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
      localStorage: storage,
      removeEventListener: vi.fn(),
    })
    authState.isAuthenticated = false
    mocks.service.listRemote.mockResolvedValue([])
    mocks.service.upsertRemote.mockImplementation(async (_client, provider) => ({
      id: provider.id,
      definitionId: provider.definitionId,
      config: provider.config,
      updatedAt: '2026-01-02T00:00:00.000Z',
      deletedAt: null,
    }))
    mocks.service.deleteRemote.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('merges a remote list into the local snapshot', async () => {
    mocks.service.listRemote.mockResolvedValue([{
      id: 'remote-provider',
      definitionId: 'openai-compatible',
      config: { apiKey: 'sk-remote' },
      updatedAt: '2026-01-02T00:00:00.000Z',
      deletedAt: null,
    }])
    const store = installStore()
    store.providers[localProvider.id] = { ...localProvider }
    authState.isAuthenticated = true

    await store.syncProviders()

    expect(store.providers[localProvider.id]?.config).toEqual({ apiKey: 'sk-local' })
    expect(store.providers[localProvider.id]?.replicaUpdatedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(store.providers['remote-provider']?.config).toEqual({ apiKey: 'sk-remote' })
    expect(mocks.service.upsertRemote).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ id: localProvider.id, config: { apiKey: 'sk-local' } }),
    )
  })

  it('keeps the local snapshot when the remote list fails', async () => {
    mocks.service.listRemote.mockRejectedValue(new Error('remote unavailable'))
    const store = installStore()
    store.providers[localProvider.id] = { ...localProvider }
    authState.isAuthenticated = true

    await store.syncProviders()

    expect(store.providers[localProvider.id]).toEqual(localProvider)
    expect(mocks.service.upsertRemote).not.toHaveBeenCalled()
  })

  it('does not upload official providers', async () => {
    const store = installStore()
    store.providers[officialProvider.id] = { ...officialProvider }
    store.providers[localProvider.id] = { ...localProvider }
    authState.isAuthenticated = true

    await store.syncProviders()

    expect(store.providers[officialProvider.id]).toEqual(officialProvider)
    expect(mocks.service.upsertRemote).toHaveBeenCalledTimes(1)
    expect(mocks.service.upsertRemote).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ id: localProvider.id }),
    )
  })

  it('uploads a local edit after sync', async () => {
    const store = installStore()
    store.providers[localProvider.id] = { ...localProvider, replicaUpdatedAt: '2026-01-01T00:00:00.000Z' }
    mocks.service.listRemote.mockResolvedValue([{
      id: localProvider.id,
      definitionId: localProvider.definitionId,
      config: { apiKey: 'sk-local' },
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }])
    authState.isAuthenticated = true

    await store.syncProviders()
    mocks.service.upsertRemote.mockClear()

    await store.updateProviderConfig(localProvider.id, { apiKey: 'sk-edited' }, 'unconfigured')
    await store.pushProviders()

    expect(mocks.service.upsertRemote).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({
        id: localProvider.id,
        config: { apiKey: 'sk-edited' },
      }),
    )
  })

  it('adds a local provider instance without a remote create', async () => {
    const store = installStore()

    const added = await store.addProvider('openai-compatible', { apiKey: 'sk-new' })

    expect(added.definitionId).toBe('openai-compatible')
    expect(store.listedProviders[added.id]?.config).toEqual({ apiKey: 'sk-new' })
    expect(mocks.service.upsertRemote).not.toHaveBeenCalled()
  })

  it('uploads a local delete as a tombstone', async () => {
    const store = installStore()
    store.providers[localProvider.id] = { ...localProvider, replicaUpdatedAt: '2026-01-01T00:00:00.000Z' }
    mocks.service.listRemote.mockResolvedValue([{
      id: localProvider.id,
      definitionId: localProvider.definitionId,
      config: localProvider.config,
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }])
    authState.isAuthenticated = true

    await store.syncProviders()
    await store.removeProvider(localProvider.id)
    await store.pushProviders()

    expect(store.providers[localProvider.id]).toBeUndefined()
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(
      mocks.client,
      localProvider.id,
    )
  })

  it('does not list a pre-existing local settings provider after sync', async () => {
    const store = installStore()
    store.providers.openai = {
      id: 'openai',
      definitionId: 'openai-compatible',
      config: { apiKey: 'sk-local' },
      status: 'configured',
      configuredBy: 'user',
    }
    authState.isAuthenticated = true

    await store.syncProviders()

    expect(store.listedProviders.openai).toBeUndefined()
    expect(store.providers.openai?.config).toEqual({ apiKey: 'sk-local' })
  })

  it('lists a remote-only provider after sync', async () => {
    mocks.service.listRemote.mockResolvedValue([{
      id: 'remote-provider',
      definitionId: 'openai-compatible',
      config: { apiKey: 'sk-remote' },
      updatedAt: '2026-01-02T00:00:00.000Z',
      deletedAt: null,
    }])
    const store = installStore()
    authState.isAuthenticated = true

    await store.syncProviders()

    expect(store.listedProviders['remote-provider']?.config).toEqual({ apiKey: 'sk-remote' })
  })

  it('does not upload when only status changes', async () => {
    const store = installStore()
    store.providers[localProvider.id] = { ...localProvider, replicaUpdatedAt: '2026-01-01T00:00:00.000Z' }
    mocks.service.listRemote.mockResolvedValue([{
      id: localProvider.id,
      definitionId: localProvider.definitionId,
      config: localProvider.config,
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }])
    authState.isAuthenticated = true

    await store.syncProviders()
    mocks.service.upsertRemote.mockClear()

    store.setProviderStatus(localProvider.id, 'configured')
    await store.pushProviders()

    expect(mocks.service.upsertRemote).not.toHaveBeenCalled()
  })
})
