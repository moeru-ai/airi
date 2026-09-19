import type { InferenceServiceProvider } from '../../libs/providers/types'

import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useProviderConfigStore } from './config'

const mocks = vi.hoisted(() => ({
  client: {},
  service: {
    buildLocal: vi.fn(),
    fetchRemote: vi.fn(),
    createRemote: vi.fn(),
    deleteRemote: vi.fn(),
    patchConfigRemote: vi.fn(),
  },
}))

vi.mock('../../composables/api', () => ({ client: mocks.client }))
vi.mock('../../services/inference-service-providers', () => ({ inferenceServiceProvidersService: mocks.service }))
vi.mock('../../libs/providers', () => ({
  getDefinedProvider: vi.fn(() => ({ id: 'openai-compatible', name: 'OpenAI Compatible' })),
}))

const localProvider = {
  id: 'local-provider',
  definitionId: 'openai-compatible',
  config: {},
  status: 'unconfigured',
  configuredBy: 'user',
} satisfies InferenceServiceProvider

const remoteProvider = {
  ...localProvider,
  id: 'remote-provider',
} satisfies InferenceServiceProvider

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
    mocks.service.buildLocal.mockReturnValue(localProvider)
    mocks.service.fetchRemote.mockResolvedValue({})
    mocks.service.createRemote.mockResolvedValue(remoteProvider)
    mocks.service.deleteRemote.mockResolvedValue(undefined)
    mocks.service.patchConfigRemote.mockResolvedValue(remoteProvider)
  })

  afterEach(() => {
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

  it('keeps the local snapshot when the remote list fails', async () => {
    mocks.service.fetchRemote.mockRejectedValue(new Error('remote unavailable'))
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    await expect(store.fetchProviders()).resolves.toEqual({ [localProvider.id]: localProvider })

    expect(store.providers).toEqual({ [localProvider.id]: localProvider })
  })

  it('preserves a local display name when the remote snapshot omits it', async () => {
    const store = installStore()
    store.providers[localProvider.id] = {
      ...localProvider,
      displayName: 'Personal OpenAI',
    }
    mocks.service.fetchRemote.mockResolvedValue({
      [localProvider.id]: localProvider,
    })

    await store.fetchProviders()

    expect(store.getProvider(localProvider.id)?.displayName).toBe('Personal OpenAI')
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
      undefined,
    )
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(mocks.client, remoteProvider.id)
  })

  it('patches configuration through the owning provider record', async () => {
    const store = installStore()
    store.providers[localProvider.id] = {
      ...localProvider,
      config: { baseUrl: 'https://example.com/v1/' },
    }

    expect(await store.patchProviderConfig(localProvider.id, { apiKey: 'sk-test' })).toBe(true)
    expect(store.getProviderConfig(localProvider.id)).toEqual({
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1/',
    })
  })

  it('persists a provider display name without adding it to runtime config', async () => {
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    await store.updateProviderConfig(localProvider.id, { apiKey: 'sk-test' }, 'configured', 'Personal OpenAI')

    expect(store.getProvider(localProvider.id)).toEqual(expect.objectContaining({
      displayName: 'Personal OpenAI',
      config: { apiKey: 'sk-test' },
    }))
    expect(store.getProviderConfig(localProvider.id)).not.toHaveProperty('displayName')
    expect(mocks.service.patchConfigRemote).toHaveBeenCalledWith(
      mocks.client,
      localProvider.id,
      { apiKey: 'sk-test' },
      'configured',
      'Personal OpenAI',
    )
  })

  it('serializes provider updates and keeps the latest completed snapshot', async () => {
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    let resolveFirst!: (provider: InferenceServiceProvider) => void
    let resolveSecond!: (provider: InferenceServiceProvider) => void
    const firstResponse = new Promise<InferenceServiceProvider>(resolve => resolveFirst = resolve)
    const secondResponse = new Promise<InferenceServiceProvider>(resolve => resolveSecond = resolve)
    const firstRemoteProvider = {
      ...localProvider,
      config: { baseUrl: 'https://first.example.com/v1' },
      displayName: 'First OpenAI',
      status: 'configured' as const,
    }
    const secondRemoteProvider = {
      ...localProvider,
      config: { baseUrl: 'https://second.example.com/v1' },
      displayName: 'Second OpenAI',
      status: 'configured' as const,
    }
    mocks.service.patchConfigRemote
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => secondResponse)

    const firstUpdate = store.updateProviderConfig(
      localProvider.id,
      firstRemoteProvider.config,
      'configured',
      firstRemoteProvider.displayName,
    )
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(1))

    const secondUpdate = store.updateProviderConfig(
      localProvider.id,
      secondRemoteProvider.config,
      'configured',
      secondRemoteProvider.displayName,
    )
    expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(1)

    resolveFirst(firstRemoteProvider)
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(2))
    resolveSecond(secondRemoteProvider)
    await Promise.all([firstUpdate, secondUpdate])

    expect(store.getProvider(localProvider.id)).toMatchObject(secondRemoteProvider)
  })

  it('does not create an incomplete provider while patching configuration', async () => {
    const store = installStore()

    expect(await store.patchProviderConfig('missing-provider', { apiKey: 'sk-test' })).toBe(false)
    expect(store.getProvider('missing-provider')).toBeUndefined()
  })
})
