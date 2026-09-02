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

  it('keeps a new local provider when the remote create fails', async () => {
    mocks.service.createRemote.mockRejectedValue(new Error('remote unavailable'))
    const store = installStore()

    await expect(store.addProvider(localProvider.definitionId)).resolves.toEqual(localProvider)

    expect(store.providers[localProvider.id]).toEqual(localProvider)
  })

  it('exposes a new provider before remote creation finishes', async () => {
    let resolveRemote!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveRemote = resolve
    }))
    const store = installStore()

    const provider = store.prepareProviderAddition(localProvider.definitionId)

    expect(provider).toEqual(localProvider)
    expect(store.providers[localProvider.id]).toBeUndefined()

    const synchronized = store.synchronizeAddedProvider(provider)
    expect(store.providers[localProvider.id]).toEqual(localProvider)
    resolveRemote(remoteProvider)
    await expect(synchronized).resolves.toEqual(remoteProvider)
  })

  it('replaces the optimistic id and keeps the remote provider listed', async () => {
    const store = installStore()

    await expect(store.addProvider(localProvider.definitionId)).resolves.toEqual(remoteProvider)

    expect(store.providers[localProvider.id]).toBeUndefined()
    expect(store.listedProviders[remoteProvider.id]).toEqual(remoteProvider)
  })

  it('preserves a configuration saved while provider creation is pending', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    const savedProvider = {
      ...remoteProvider,
      config: { apiKey: 'sk-saved' },
      status: 'configured',
    } satisfies InferenceServiceProvider
    mocks.service.patchConfigRemote.mockResolvedValue(savedProvider)
    const store = installStore()

    const creating = store.addProvider(localProvider.definitionId)
    await store.updateProviderConfig(localProvider.id, savedProvider.config, savedProvider.status)
    resolveCreate(remoteProvider)

    await expect(creating).resolves.toEqual(savedProvider)
    expect(store.providers).toEqual({ [remoteProvider.id]: savedProvider })
    expect(mocks.service.patchConfigRemote).toHaveBeenLastCalledWith(
      mocks.client,
      remoteProvider.id,
      savedProvider.config,
      savedProvider.status,
    )
  })

  it('does not restore a provider deleted while creation is pending', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    const store = installStore()

    const creating = store.addProvider(localProvider.definitionId)
    await store.removeProvider(localProvider.id)
    resolveCreate(remoteProvider)

    await expect(creating).resolves.toEqual(remoteProvider)
    expect(store.providers).toEqual({})
    expect(mocks.service.deleteRemote).toHaveBeenLastCalledWith(mocks.client, remoteProvider.id)
  })

  it('restores a created provider after a replicated snapshot temporarily removes it', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    const store = installStore()

    const creating = store.addProvider(localProvider.definitionId)
    await vi.waitFor(() => expect(resolveCreate).toBeTypeOf('function'))
    delete store.providers[localProvider.id]
    resolveCreate(remoteProvider)

    await expect(creating).resolves.toEqual(remoteProvider)
    expect(store.providers).toEqual({ [remoteProvider.id]: remoteProvider })
    expect(mocks.service.deleteRemote).not.toHaveBeenCalled()
  })

  it('preserves pending mutations when a replicated snapshot removes the optimistic provider', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote
      .mockRejectedValueOnce(new Error('provider is not created yet'))
      .mockImplementation(async (
        _client: unknown,
        providerId: string,
        config: Record<string, unknown>,
        status: InferenceServiceProvider['status'],
      ) => ({
        ...remoteProvider,
        id: providerId,
        config: { ...config },
        status,
      }))
    const store = installStore()
    const savedConfig = { apiKey: 'sk-saved' }

    const creating = store.addProvider(localProvider.definitionId)
    await store.updateProviderConfig(localProvider.id, savedConfig, 'configured')
    const validationLease = await store.beginProviderValidation(localProvider.id)
    delete store.providers[localProvider.id]
    resolveCreate(remoteProvider)

    await creating
    expect(mocks.service.patchConfigRemote).toHaveBeenLastCalledWith(
      mocks.client,
      remoteProvider.id,
      savedConfig,
      'configured',
    )
    expect(store.providers[remoteProvider.id]).toEqual({
      ...remoteProvider,
      config: savedConfig,
      status: 'validating',
    })
    expect(store.providerValidationLeases[remoteProvider.id]?.token).toBe(validationLease?.token)
    await expect(store.finishProviderValidation(remoteProvider.id, validationLease!.token, 'configured')).resolves.toBe(true)
  })

  it.each([
    { outcome: 'success', snapshot: 'removal' },
    { outcome: 'failure', snapshot: 'removal' },
    { outcome: 'success', snapshot: 'replacement' },
    { outcome: 'failure', snapshot: 'replacement' },
  ] as const)(
    'restores pending mutations after a replicated $snapshot during reconciliation patch $outcome',
    async ({ outcome, snapshot }) => {
      let resolveCreate!: (provider: InferenceServiceProvider) => void
      let resolvePatch!: (provider: InferenceServiceProvider) => void
      let rejectPatch!: (error: Error) => void
      mocks.service.createRemote.mockImplementation(() => new Promise((resolve) => {
        resolveCreate = resolve
      }))
      mocks.service.patchConfigRemote
        .mockRejectedValueOnce(new Error('provider is not created yet'))
        .mockImplementationOnce(() => new Promise((resolve, reject) => {
          resolvePatch = resolve
          rejectPatch = reject
        }))
      const store = installStore()
      const savedConfig = { apiKey: 'sk-saved' }

      const creating = store.addProvider(localProvider.definitionId)
      await store.updateProviderConfig(localProvider.id, savedConfig, 'configured')
      const validationLease = await store.beginProviderValidation(localProvider.id)
      resolveCreate(remoteProvider)
      await vi.waitFor(() => expect(resolvePatch).toBeTypeOf('function'))
      if (snapshot === 'removal') {
        delete store.providers[remoteProvider.id]
      }
      else {
        store.providers[remoteProvider.id] = {
          ...remoteProvider,
          config: { apiKey: 'sk-stale' },
        }
      }
      delete store.providerValidationLeases[remoteProvider.id]

      if (outcome === 'success') {
        resolvePatch({
          ...remoteProvider,
          config: savedConfig,
          status: 'configured',
        })
      }
      else {
        rejectPatch(new Error('replication interrupted the patch'))
      }
      await creating

      expect(store.providers[remoteProvider.id]).toEqual({
        ...remoteProvider,
        config: savedConfig,
        status: 'validating',
      })
      expect(store.providerValidationLeases[remoteProvider.id]?.token).toBe(validationLease?.token)
      await expect(store.finishProviderValidation(remoteProvider.id, validationLease!.token, 'configured')).resolves.toBe(true)
    },
  )

  it('removes a stale replicated validation lease while reconciliation is pending', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    let resolvePatch!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePatch = resolve
    }))
    mocks.service.buildLocal.mockReturnValue({
      ...localProvider,
      config: { ...localProvider.config },
    })
    const store = installStore()

    const creating = store.addProvider(localProvider.definitionId)
    const validationLease = await store.beginProviderValidation(localProvider.id)
    await store.finishProviderValidation(localProvider.id, validationLease!.token, 'configured')
    resolveCreate(remoteProvider)
    await vi.waitFor(() => expect(resolvePatch).toBeTypeOf('function'))
    store.providers[remoteProvider.id] = {
      ...remoteProvider,
      status: 'validating',
    }
    store.providerValidationLeases[remoteProvider.id] = validationLease!
    resolvePatch({ ...remoteProvider, status: 'configured' })

    await creating
    expect(store.providers[remoteProvider.id]?.status).toBe('configured')
    expect(store.providerValidationLeases[remoteProvider.id]).toBeUndefined()
    await store.resetProviders()
  })

  it('restores pending mutations when remote creation fails after a replicated removal', async () => {
    let rejectCreate!: (error: Error) => void
    mocks.service.createRemote.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectCreate = reject
    }))
    mocks.service.patchConfigRemote.mockRejectedValue(new Error('provider is not created yet'))
    const store = installStore()
    const savedConfig = { apiKey: 'sk-saved' }

    const creating = store.addProvider(localProvider.definitionId)
    await store.updateProviderConfig(localProvider.id, savedConfig, 'configured')
    const validationLease = await store.beginProviderValidation(localProvider.id)
    delete store.providers[localProvider.id]
    delete store.providerValidationLeases[localProvider.id]
    rejectCreate(new Error('remote create failed'))

    await creating
    expect(store.providers[localProvider.id]).toEqual({
      ...localProvider,
      config: savedConfig,
      status: 'validating',
    })
    expect(store.providerValidationLeases[localProvider.id]?.token).toBe(validationLease?.token)
    await expect(store.finishProviderValidation(localProvider.id, validationLease!.token, 'configured')).resolves.toBe(true)
  })

  it('does not restore a resolved provider deleted while reconciliation is pending', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    let resolvePatch!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote
      .mockRejectedValueOnce(new Error('provider is not created yet'))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePatch = resolve
      }))
    const store = installStore()
    const savedConfig = { apiKey: 'sk-saved' }

    const creating = store.addProvider(localProvider.definitionId)
    await store.updateProviderConfig(localProvider.id, savedConfig, 'configured')
    resolveCreate(remoteProvider)
    await vi.waitFor(() => expect(resolvePatch).toBeTypeOf('function'))
    await store.removeProvider(remoteProvider.id)
    resolvePatch({ ...remoteProvider, config: savedConfig, status: 'configured' })
    await creating

    expect(store.providers).toEqual({})
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(mocks.client, remoteProvider.id)
  })

  it.each([
    { action: 'finish', expectedStatus: 'configured' as const },
    { action: 'restore', expectedStatus: 'unconfigured' as const },
  ])('records validation $action while a replicated snapshot is missing', async ({ action, expectedStatus }) => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote.mockImplementation(async (
      _client: unknown,
      providerId: string,
      config: Record<string, unknown>,
      status: InferenceServiceProvider['status'],
    ) => ({
      ...remoteProvider,
      id: providerId,
      config: { ...config },
      status,
    }))
    const store = installStore()

    const creating = store.addProvider(localProvider.definitionId)
    const validationLease = await store.beginProviderValidation(localProvider.id)
    delete store.providers[localProvider.id]
    delete store.providerValidationLeases[localProvider.id]

    const transitioned = action === 'finish'
      ? await store.finishProviderValidation(localProvider.id, validationLease!.token, 'configured')
      : await store.restoreProviderStatus(localProvider.id, validationLease!.token)
    expect(transitioned).toBe(true)
    resolveCreate(remoteProvider)
    await creating

    expect(store.providers[remoteProvider.id]?.status).toBe(expectedStatus)
    expect(store.providerValidationLeases[remoteProvider.id]).toBeUndefined()
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
