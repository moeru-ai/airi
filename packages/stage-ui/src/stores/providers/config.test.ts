import type { InferenceServiceProvider } from '../../libs/providers/types'

import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { resolveProviderCreationId, useProviderConfigStore } from './config'

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

  it('resolves provider creation aliases as a pure projection', () => {
    expect(resolveProviderCreationId({ local: 'intermediate', intermediate: 'remote' }, 'local')).toBe('remote')
    expect(resolveProviderCreationId({ first: 'second', second: 'first' }, 'first')).toBe('first')
    expect(resolveProviderCreationId({}, 'unchanged')).toBe('unchanged')

    const store = installStore()
    expect('resolveProviderId' in store).toBe(false)
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

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3931007017
  it('preserves token-owned validation across a remote snapshot refresh for PR #2435', async () => {
    mocks.service.fetchRemote.mockResolvedValue({
      [localProvider.id]: { ...localProvider, status: 'unconfigured' },
    })
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)
    await store.setProviderStatus(localProvider.id, 'configured')
    const validationToken = crypto.randomUUID()

    await store.beginProviderValidation(localProvider.id, validationToken)
    await store.fetchProviders()

    expect(store.providers[localProvider.id]?.status).toBe('validating')
    await expect(store.finishProviderValidation(localProvider.id, validationToken, 'configured')).resolves.toBe(true)
    expect(store.providers[localProvider.id]?.status).toBe('configured')
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

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3920910268
  it('stores the caller validation token for PR #2435', async () => {
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)
    await store.setProviderStatus(localProvider.id, 'configured')
    const validationToken = crypto.randomUUID()

    await store.beginProviderValidation(localProvider.id, validationToken)

    expect(store.providerValidationLeases[localProvider.id]).toEqual({
      previousStatus: 'configured',
      token: validationToken,
    })
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3920910268
  it('commits validated config only while the caller token owns the lease for PR #2435', async () => {
    // ROOT CAUSE:
    //
    // Checking a completion and saving in separate actions leaves a window for
    // a newer validation to start before the older draft reaches the leader.
    mocks.service.patchConfigRemote.mockImplementation(async (
      _client: unknown,
      providerId: string,
      config: Record<string, unknown>,
      status: InferenceServiceProvider['status'],
    ) => ({ ...remoteProvider, id: providerId, config: { ...config }, status }))
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)
    await store.setProviderStatus(localProvider.id, 'configured')
    const staleToken = crypto.randomUUID()
    const latestToken = crypto.randomUUID()
    const staleConfig = { apiKey: 'sk-stale' }
    const latestConfig = { apiKey: 'sk-latest' }

    await store.beginProviderValidation(localProvider.id, staleToken)
    await store.beginProviderValidation(localProvider.id, latestToken)
    await store.finishProviderValidationAndUpdateConfig(localProvider.id, staleToken, staleConfig)

    expect(mocks.service.patchConfigRemote).not.toHaveBeenCalled()
    expect(store.providerValidationLeases[localProvider.id]?.token).toBe(latestToken)
    expect(store.providers[localProvider.id]?.status).toBe('validating')

    await store.finishProviderValidationAndUpdateConfig(localProvider.id, latestToken, latestConfig)

    expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce()
    expect(store.providers[localProvider.id]?.config).toEqual(latestConfig)
    expect(store.providers[localProvider.id]?.status).toBe('configured')
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3914588970
  it('starts a later save after the creation reconciliation patch for PR #2435', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    let resolveReconciliation!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote.mockImplementation(async (
      _client: unknown,
      providerId: string,
      config: Record<string, unknown>,
      status: InferenceServiceProvider['status'],
    ) => {
      if (mocks.service.patchConfigRemote.mock.calls.length === 1) {
        return await new Promise<InferenceServiceProvider>((resolve) => {
          resolveReconciliation = resolve
        })
      }
      return { ...remoteProvider, id: providerId, config: { ...config }, status }
    })
    const store = installStore()

    const creation = store.synchronizeAddedProvider({ ...localProvider })
    await store.setProviderStatus(localProvider.id, 'configured')
    resolveCreate(remoteProvider)
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())

    const latestConfig = { apiKey: 'sk-latest' }
    const laterSave = store.updateProviderConfig(localProvider.id, latestConfig, 'configured')
    await vi.waitFor(() => expect(store.providers[remoteProvider.id]?.config).toEqual(latestConfig))
    const callsBeforeReconciliationFinished = mocks.service.patchConfigRemote.mock.calls.length

    resolveReconciliation({ ...remoteProvider, status: 'configured' })
    await creation
    await laterSave

    expect(callsBeforeReconciliationFinished).toBe(1)
    expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(2)
    expect(mocks.service.patchConfigRemote).toHaveBeenNthCalledWith(
      2,
      mocks.client,
      remoteProvider.id,
      latestConfig,
      'configured',
    )
    expect(store.providers[remoteProvider.id]?.config).toEqual(latestConfig)
  })

  it('keeps creation reconciliation behind a pending optimistic-id write', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    let rejectOptimisticSave!: (error: Error) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote
      .mockReturnValueOnce(new Promise<InferenceServiceProvider>((_resolve, reject) => {
        rejectOptimisticSave = reject
      }))
      .mockImplementationOnce(async (
        _client: unknown,
        providerId: string,
        config: Record<string, unknown>,
        status: InferenceServiceProvider['status'],
      ) => ({ ...remoteProvider, id: providerId, config: { ...config }, status }))
    const store = installStore()
    const savedConfig = { apiKey: 'sk-pending' }

    const creation = store.addProvider(localProvider.definitionId)
    const optimisticSave = store.updateProviderConfig(localProvider.id, savedConfig, 'configured')
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())
    resolveCreate(remoteProvider)

    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce()

    rejectOptimisticSave(new Error('optimistic id is not created'))
    await optimisticSave
    await creation

    expect(mocks.service.patchConfigRemote).toHaveBeenNthCalledWith(
      2,
      mocks.client,
      remoteProvider.id,
      savedConfig,
      'configured',
    )
    expect(store.providers[remoteProvider.id]?.config).toEqual(savedConfig)
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3914588970
  it('keeps the latest optimistic config when its queued save fails for PR #2435', async () => {
    // ROOT CAUSE:
    //
    // Serial execution alone does not stop an older successful response from
    // replacing a newer optimistic object before the newer request fails.
    let resolveFirstSave!: (provider: InferenceServiceProvider) => void
    mocks.service.patchConfigRemote
      .mockReturnValueOnce(new Promise<InferenceServiceProvider>((resolve) => {
        resolveFirstSave = resolve
      }))
      .mockRejectedValueOnce(new Error('latest save failed'))
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)

    const firstConfig = { apiKey: 'sk-first' }
    const latestConfig = { apiKey: 'sk-latest' }
    const firstSave = store.updateProviderConfig(localProvider.id, firstConfig, 'configured')
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())
    const latestSave = store.updateProviderConfig(localProvider.id, latestConfig, 'configured')

    expect(store.providers[localProvider.id]?.config).toEqual(latestConfig)
    resolveFirstSave({ ...localProvider, config: firstConfig, status: 'configured' })
    await firstSave
    await latestSave

    expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(2)
    expect(store.providers[localProvider.id]?.config).toEqual(latestConfig)
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3914588970
  it('moves a newer queued save to the canonical id returned by an older save for PR #2435', async () => {
    // ROOT CAUSE:
    //
    // A stale response can still carry the canonical server id. Ignoring the
    // whole response leaves later queued writes targeting an obsolete id.
    let resolveFirstSave!: (provider: InferenceServiceProvider) => void
    mocks.service.patchConfigRemote
      .mockReturnValueOnce(new Promise<InferenceServiceProvider>((resolve) => {
        resolveFirstSave = resolve
      }))
      .mockRejectedValueOnce(new Error('latest save failed'))
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)

    const firstConfig = { apiKey: 'sk-first' }
    const latestConfig = { apiKey: 'sk-latest' }
    const firstSave = store.updateProviderConfig(localProvider.id, firstConfig, 'configured')
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())
    const latestSave = store.updateProviderConfig(localProvider.id, latestConfig, 'configured')

    resolveFirstSave({ ...remoteProvider, config: firstConfig, status: 'configured' })
    await firstSave
    await latestSave

    expect(mocks.service.patchConfigRemote).toHaveBeenNthCalledWith(
      2,
      mocks.client,
      remoteProvider.id,
      latestConfig,
      'configured',
    )
    expect(store.providers[localProvider.id]).toBeUndefined()
    expect(store.providers[remoteProvider.id]?.config).toEqual(latestConfig)
  })

  it('keeps post-remap saves in the original provider write queue', async () => {
    let resolveFirstSave!: (provider: InferenceServiceProvider) => void
    let resolveSecondSave!: (provider: InferenceServiceProvider) => void
    mocks.service.patchConfigRemote
      .mockReturnValueOnce(new Promise<InferenceServiceProvider>((resolve) => {
        resolveFirstSave = resolve
      }))
      .mockReturnValueOnce(new Promise<InferenceServiceProvider>((resolve) => {
        resolveSecondSave = resolve
      }))
      .mockImplementationOnce(async (
        _client: unknown,
        providerId: string,
        config: Record<string, unknown>,
        status: InferenceServiceProvider['status'],
      ) => ({ ...remoteProvider, id: providerId, config: { ...config }, status }))
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)

    const firstSave = store.updateProviderConfig(localProvider.id, { revision: 1 }, 'configured')
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())
    const secondSave = store.updateProviderConfig(localProvider.id, { revision: 2 }, 'configured')
    resolveFirstSave({ ...remoteProvider, config: { revision: 1 }, status: 'configured' })
    await firstSave
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(2))

    const thirdSave = store.updateProviderConfig(remoteProvider.id, { revision: 3 }, 'configured')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(2)

    resolveSecondSave({ ...remoteProvider, config: { revision: 2 }, status: 'configured' })
    await secondSave
    await thirdSave

    expect(mocks.service.patchConfigRemote).toHaveBeenNthCalledWith(
      3,
      mocks.client,
      remoteProvider.id,
      { revision: 3 },
      'configured',
    )
    expect(store.providers[remoteProvider.id]?.config).toEqual({ revision: 3 })
  })

  it('does not restore an ordinary update after the provider store resets', async () => {
    let resolveSave!: (provider: InferenceServiceProvider) => void
    mocks.service.patchConfigRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveSave = resolve
    }))
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)

    const save = store.updateProviderConfig(localProvider.id, { apiKey: 'sk-reset' }, 'configured')
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())
    await store.resetProviders()
    resolveSave(remoteProvider)
    await save

    expect(store.providers).toEqual({})
    expect(store.providerCreationResolutions).toEqual({})
  })

  it('does not send a queued update after the provider store resets', async () => {
    let resolveFirstSave!: (provider: InferenceServiceProvider) => void
    mocks.service.patchConfigRemote.mockReturnValueOnce(new Promise<InferenceServiceProvider>((resolve) => {
      resolveFirstSave = resolve
    }))
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)

    const firstSave = store.updateProviderConfig(localProvider.id, { revision: 1 }, 'configured')
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())
    const queuedSave = store.updateProviderConfig(localProvider.id, { revision: 2 }, 'configured')
    await store.resetProviders()
    resolveFirstSave({ ...localProvider, config: { revision: 1 }, status: 'configured' })
    await firstSave
    await queuedSave

    expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce()
    expect(store.providers).toEqual({})
  })

  it('orders deletion after an in-flight write and skips queued updates', async () => {
    let resolveFirstSave!: (provider: InferenceServiceProvider) => void
    mocks.service.patchConfigRemote.mockReturnValueOnce(new Promise<InferenceServiceProvider>((resolve) => {
      resolveFirstSave = resolve
    }))
    const store = installStore()
    await store.ensureProvider(localProvider.id, localProvider.definitionId)

    const firstSave = store.updateProviderConfig(localProvider.id, { revision: 1 }, 'configured')
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())
    const queuedSave = store.updateProviderConfig(localProvider.id, { revision: 2 }, 'configured')
    const removal = store.removeProvider(localProvider.id)

    expect(mocks.service.deleteRemote).not.toHaveBeenCalled()
    resolveFirstSave({ ...remoteProvider, config: { revision: 1 }, status: 'configured' })
    await firstSave
    await queuedSave
    await removal

    expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce()
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(mocks.client, remoteProvider.id)
    expect(store.providers).toEqual({})
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

  it('prefers owner-captured mutations over a stale replicated optimistic provider', async () => {
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
      ) => ({ ...remoteProvider, id: providerId, config: { ...config }, status }))
    const store = installStore()
    const savedConfig = { apiKey: 'sk-saved' }

    const creating = store.addProvider(localProvider.definitionId)
    await store.updateProviderConfig(localProvider.id, savedConfig, 'configured')
    const validationLease = await store.beginProviderValidation(localProvider.id)
    store.providers[localProvider.id] = { ...localProvider }
    delete store.providerValidationLeases[localProvider.id]
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
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3931156683
  it('preserves an early invalid result through pending-create reconciliation for PR #2435', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote.mockResolvedValue({ ...remoteProvider, status: 'unconfigured' })
    const store = installStore()

    const creating = store.addProvider(localProvider.definitionId)
    const lease = await store.beginProviderValidation(localProvider.id)
    await store.finishProviderValidation(localProvider.id, lease!.token, 'invalid')
    resolveCreate(remoteProvider)
    await creating

    expect(store.providers[remoteProvider.id]?.status).toBe('invalid')
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
    const removal = store.removeProvider(remoteProvider.id)
    expect(mocks.service.deleteRemote).not.toHaveBeenCalled()
    resolvePatch({ ...remoteProvider, config: savedConfig, status: 'configured' })
    await removal
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
