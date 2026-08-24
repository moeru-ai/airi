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
})
