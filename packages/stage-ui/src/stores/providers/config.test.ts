import type { InferenceServiceProvider } from '../../libs/providers/types'

import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { CustomModelConfigError } from '../../libs/providers/custom-model/config'
import { useProviderConfigStore } from './config'

const mocks = vi.hoisted(() => ({
  client: {},
  token: 'test-token' as string | null,
  service: {
    buildLocal: vi.fn(),
    fetchRemote: vi.fn(),
    createRemote: vi.fn(),
    deleteRemote: vi.fn(),
    patchConfigRemote: vi.fn(),
  },
  customModelCount: 0,
}))

vi.mock('../../composables/api', () => ({ client: mocks.client }))
vi.mock('../auth', () => ({
  useAuthStore: () => ({ token: mocks.token }),
}))
vi.mock('../../services/inference-service-providers', () => ({ inferenceServiceProvidersService: mocks.service }))
vi.mock('../../libs/providers', () => ({
  getDefinedProvider: vi.fn((id: string) => ({
    id,
    name: id === 'custom-model' ? 'Custom Model' : 'OpenAI Compatible',
    configStorage: id === 'custom-model' ? 'local' : 'remote',
  })),
}))

const localProvider = {
  id: 'local-provider',
  definitionId: 'openai-compatible',
  name: 'OpenAI Compatible',
  persistence: 'remote',
  config: {},
  status: 'unconfigured',
  configuredBy: 'user',
} satisfies InferenceServiceProvider

const customConnectionConfig = {
  protocol: 'openai-chat-completions',
  baseUrl: 'https://example.com/v1',
  generationPath: 'chat/completions',
  auth: { type: 'bearer', secret: 'secret-value' },
  headers: {},
  models: [{ id: 'gpt-test' }],
}

const customProvider = {
  id: 'custom-provider',
  definitionId: 'custom-model',
  name: 'OpenCode Go',
  persistence: 'local',
  config: customConnectionConfig,
  status: 'unconfigured',
  configuredBy: 'user',
} satisfies InferenceServiceProvider

const remoteProvider = {
  ...localProvider,
  id: 'remote-provider',
} satisfies InferenceServiceProvider

const memoryStorage = new Map<string, string>()

function installStore() {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  app.use(PiniaColada)
  setActivePinia(pinia)
  return useProviderConfigStore()
}

describe('provider config store', () => {
  beforeEach(() => {
    mocks.token = 'test-token'
    memoryStorage.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStorage.set(key, value)
      },
      removeItem: (key: string) => {
        memoryStorage.delete(key)
      },
      clear: () => {
        memoryStorage.clear()
      },
      key: (index: number) => [...memoryStorage.keys()][index] ?? null,
      get length() {
        return memoryStorage.size
      },
    })
    mocks.customModelCount = 0
    mocks.service.buildLocal.mockImplementation((definitionId: string) => {
      if (definitionId === 'custom-model') {
        mocks.customModelCount += 1
        return {
          ...customProvider,
          id: `custom-provider-${mocks.customModelCount}`,
          name: 'Custom Model',
          config: {},
          status: 'unconfigured',
        } satisfies InferenceServiceProvider
      }

      return { ...localProvider }
    })
    mocks.service.fetchRemote.mockResolvedValue({})
    mocks.service.createRemote.mockResolvedValue(remoteProvider)
    mocks.service.deleteRemote.mockResolvedValue(undefined)
    mocks.service.patchConfigRemote.mockResolvedValue(remoteProvider)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('loads the local snapshot before it applies the remote snapshot', async () => {
    mocks.service.fetchRemote.mockResolvedValue({ [remoteProvider.id]: remoteProvider })
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    await expect(store.fetchProviders()).resolves.toEqual({
      [localProvider.id]: localProvider,
      [remoteProvider.id]: remoteProvider,
    })

    expect(store.providers).toEqual({
      [localProvider.id]: localProvider,
      [remoteProvider.id]: remoteProvider,
    })
  })

  // ROOT CAUSE:
  //
  // fetchProviders returned the Vue reactive provider map. pinia-plugin-synced
  // then called structuredClone on that result and threw DataCloneError.
  // The v2 providers page calls this action on mount, so the page went blank.
  //
  // We return a JSON snapshot so the action result can be cloned.
  it('returns a structuredClone-safe provider snapshot', async () => {
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    const snapshot = await store.fetchProviders()

    expect(() => structuredClone(snapshot)).not.toThrow()
    expect(snapshot[localProvider.id]).toEqual(localProvider)
  })

  // ROOT CAUSE:
  //
  // An anonymous fetchProviders call hit the remote API, got 401, and started
  // a full-page OIDC sign-in. The user saw a blank or black screen.
  //
  // Local custom connections must stay readable without a session.
  it('does not fetch remote providers when there is no session', async () => {
    mocks.token = null
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    await expect(store.fetchProviders()).resolves.toEqual({ [localProvider.id]: localProvider })

    expect(mocks.service.fetchRemote).not.toHaveBeenCalled()
  })

  it('keeps the local snapshot when the remote list fails', async () => {
    mocks.service.fetchRemote.mockRejectedValue(new Error('remote unavailable'))
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    await expect(store.fetchProviders()).resolves.toEqual({ [localProvider.id]: localProvider })

    expect(store.providers).toEqual({ [localProvider.id]: localProvider })
  })

  it('keeps a new local provider when the remote create fails', async () => {
    mocks.service.createRemote.mockRejectedValue(new Error('remote unavailable'))
    const store = installStore()

    await expect(store.addProvider(localProvider.definitionId)).resolves.toEqual(localProvider)

    expect(store.providers[localProvider.id]).toEqual(localProvider)
  })

  it('replaces the optimistic id and keeps the remote provider listed', async () => {
    const store = installStore()

    await expect(store.addProvider(localProvider.definitionId)).resolves.toEqual(remoteProvider)

    expect(store.providers[localProvider.id]).toBeUndefined()
    expect(store.listedProviders[remoteProvider.id]).toEqual(remoteProvider)
  })

  it('updates and removes a provider through the store interface', async () => {
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    await store.updateProviderConfig(localProvider.id, { apiKey: 'sk-test' }, 'configured')
    await store.removeProvider(remoteProvider.id)

    expect(mocks.service.patchConfigRemote).toHaveBeenCalledWith(
      mocks.client,
      localProvider.id,
      { apiKey: 'sk-test' },
      'configured',
    )
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(mocks.client, remoteProvider.id)
  })

  // ROOT CAUSE:
  //
  // The provider config store sends every provider instance to the remote API.
  // A custom connection contains user-supplied secrets and must remain local.
  //
  // Before this fix, add, update, and remove always called the remote service.
  // We fix it by using the provider definition's explicit storage policy.
  it('keeps custom model connections and their secrets on this device', async () => {
    const store = installStore()

    const created = await store.addProvider('custom-model', customConnectionConfig, { name: 'OpenCode Go' })
    expect(created).toMatchObject({
      definitionId: 'custom-model',
      name: 'OpenCode Go',
      persistence: 'local',
      config: {
        protocol: 'openai-chat-completions',
        baseUrl: 'https://example.com/v1/',
        generationPath: 'chat/completions',
        auth: { type: 'bearer', secret: 'secret-value' },
      },
    })

    await expect(store.updateProviderConfig(created.id, {
      ...customConnectionConfig,
      auth: { type: 'bearer', secret: 'new-secret' },
    }, 'configured', { validationResult: true })).resolves.toMatchObject({
      config: {
        auth: { type: 'bearer', secret: 'new-secret' },
      },
      status: 'configured',
    })
    await store.removeProvider(created.id)

    expect(mocks.service.createRemote).not.toHaveBeenCalled()
    expect(mocks.service.patchConfigRemote).not.toHaveBeenCalled()
    expect(mocks.service.deleteRemote).not.toHaveBeenCalled()
  })

  it('creates, renames, and isolates multiple named custom connections', async () => {
    const store = installStore()

    const first = await store.addProvider('custom-model', customConnectionConfig, { name: 'OpenCode Go' })
    const second = await store.addProvider('custom-model', {
      ...customConnectionConfig,
      baseUrl: 'https://other.example/v1',
      models: [{ id: 'other-model' }],
    }, { name: 'Private Gateway' })

    await store.updateProviderName(first.id, 'OpenCode Go Work')

    expect(store.providers[first.id]?.name).toBe('OpenCode Go Work')
    expect(store.providers[second.id]?.name).toBe('Private Gateway')
    expect(store.providers[first.id]?.config.models).toEqual([{ id: 'gpt-test' }])
    expect(store.providers[second.id]?.config.models).toEqual([{ id: 'other-model' }])
    expect(store.listedProviders[first.id]).toBeDefined()
    expect(store.listedProviders[second.id]).toBeDefined()
  })

  it('rejects reserved headers and invalid endpoints on save', async () => {
    const store = installStore()
    const created = await store.addProvider('custom-model')

    await expect(store.updateProviderConfig(created.id, {
      ...customConnectionConfig,
      headers: { Authorization: 'Bearer other' },
    }, 'unconfigured')).rejects.toBeInstanceOf(CustomModelConfigError)

    await expect(store.updateProviderConfig(created.id, {
      ...customConnectionConfig,
      generationPath: 'https://attacker.example/chat/completions',
    }, 'unconfigured')).rejects.toMatchObject({
      code: 'invalid-path',
      field: 'generationPath',
    })

    expect(store.providers[created.id]?.config).toEqual({})
  })

  // ROOT CAUSE:
  //
  // Saving an edited connection reused the previous configured status.
  // Request fields had changed, so a stale success state was shown.
  //
  // We reset configured status unless the caller stores a validation result.
  it('resets configured status when request fields change', async () => {
    const store = installStore()
    const created = await store.addProvider('custom-model', customConnectionConfig)

    await store.updateProviderConfig(created.id, customConnectionConfig, 'configured', { validationResult: true })
    const edited = await store.updateProviderConfig(created.id, {
      ...customConnectionConfig,
      baseUrl: 'https://example.com/v2',
    }, 'configured')

    expect(edited?.status).toBe('unconfigured')
    expect(edited?.config.baseUrl).toBe('https://example.com/v2/')
  })

  // ROOT CAUSE:
  //
  // fetchProviders merged every remote id over the local snapshot.
  // A colliding remote record could replace a local custom connection and its secrets.
  //
  // Local persistence now wins for those ids. Existing remote providers still update.
  it('does not let a remote snapshot replace a local custom connection', async () => {
    const store = installStore()
    const created = await store.addProvider('custom-model', customConnectionConfig, { name: 'OpenCode Go' })
    store.providers[localProvider.id] = localProvider

    const remoteReplacement = {
      ...created,
      persistence: 'remote',
      config: {},
      name: 'Remote Collision',
    } satisfies InferenceServiceProvider
    const remoteUpdated = {
      ...localProvider,
      config: { apiKey: 'from-remote' },
      status: 'configured',
    } satisfies InferenceServiceProvider

    mocks.service.fetchRemote.mockResolvedValue({
      [created.id]: remoteReplacement,
      [localProvider.id]: remoteUpdated,
    })

    await store.fetchProviders()

    expect(store.providers[created.id]).toMatchObject({
      name: 'OpenCode Go',
      persistence: 'local',
      config: {
        auth: { type: 'bearer', secret: 'secret-value' },
      },
    })
    expect(store.providers[localProvider.id]).toEqual(remoteUpdated)
  })
})
