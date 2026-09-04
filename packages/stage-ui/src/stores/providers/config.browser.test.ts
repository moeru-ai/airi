import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { InferenceServiceProvider } from '../../libs/providers/types'

import { PiniaColada } from '@pinia/colada'
import { useCloned } from '@vueuse/core'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, ref, watch } from 'vue'

import { createLatestValidationGuard, createProviderDraftSourceKey, createValidationStatusRestorer } from '../../libs/providers/validation-run'
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

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, leadership, namespace })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia).use(PiniaColada)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('provider config synchronization', () => {
  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('keeps optimistic creation synchronous and synchronizes a serializable provider', async () => {
    let resolveRemote!: (provider: InferenceServiceProvider) => void
    mocks.service.buildLocal.mockReturnValue(localProvider)
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveRemote = resolve
    }))
    const namespace = `provider-config:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useProviderConfigStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const optimistic = followerStore.prepareProviderAddition(localProvider.definitionId)

    expect(optimistic).toEqual(localProvider)
    const synchronized = followerStore.synchronizeAddedProvider(optimistic)
    await vi.waitFor(() => {
      expect(leaderStore.providers[localProvider.id]).toEqual(localProvider)
      expect(followerStore.providers[localProvider.id]).toEqual(localProvider)
    })

    resolveRemote(remoteProvider)
    // Follower actions are delegated to the leader, so the synchronized Pinia
    // runtime does not preserve an action return value across that boundary.
    // The durable contract is the replicated provider state below.
    await synchronized
    await vi.waitFor(() => {
      expect({
        leader: leaderStore.providers,
        follower: followerStore.providers,
      }).toEqual({
        leader: { [remoteProvider.id]: remoteProvider },
        follower: { [remoteProvider.id]: remoteProvider },
      })
    }, { timeout: 3000 })
    expect(mocks.service.patchConfigRemote).not.toHaveBeenCalled()
    expect(leaderStore.providerCreationResolutions[localProvider.id]).toBe(remoteProvider.id)
    expect(followerStore.providerCreationResolutions[localProvider.id]).toBe(remoteProvider.id)

    await followerStore.setProviderStatus(remoteProvider.id, 'configured')
    await vi.waitFor(() => expect(leaderStore.providers[remoteProvider.id]?.status).toBe('configured'))

    let runMountedValidation!: () => Promise<void>
    let mountedValidationStayedCurrent = false
    const mountedEditor = createApp(defineComponent({
      setup() {
        const store = useProviderConfigStore()
        const guard = createLatestValidationGuard()
        const draftSourceKey = computed(() => createProviderDraftSourceKey(store.getProvider(remoteProvider.id)))
        watch(draftSourceKey, () => guard.invalidate(), { immediate: true })
        runMountedValidation = async () => {
          const isCurrentRun = guard.begin()
          const validationLease = await store.beginProviderValidation(remoteProvider.id)
          mountedValidationStayedCurrent = isCurrentRun()
          if (validationLease)
            await store.restoreProviderStatus(remoteProvider.id, validationLease.token)
        }
        return () => h('div')
      },
    }))
    const mountedEditorHost = document.createElement('div')
    document.body.appendChild(mountedEditorHost)
    mountedEditor.use(followerContext.pinia)
    mountedEditor.mount(mountedEditorHost)

    await runMountedValidation()
    expect(mountedValidationStayedCurrent).toBe(true)
    mountedEditor.unmount()
    mountedEditorHost.remove()

    const restorer = createValidationStatusRestorer<string>(async (providerId, token) => {
      await followerStore.restoreProviderStatus(providerId, token)
    })
    let canceled = false
    const validationStart = (async () => {
      const validationLease = await followerStore.beginProviderValidation(remoteProvider.id)
      if (!validationLease)
        return
      restorer.begin(remoteProvider.id, validationLease.token)
      if (canceled)
        await restorer.restore()
    })()

    canceled = true
    await validationStart
    await vi.waitFor(() => {
      expect(leaderStore.providers[remoteProvider.id]?.status).toBe('configured')
      expect(followerStore.providers[remoteProvider.id]?.status).toBe('configured')
    })

    const followerValidation = await followerStore.beginProviderValidation(remoteProvider.id)
    const leaderValidation = await leaderStore.beginProviderValidation(remoteProvider.id)
    expect(followerValidation?.token).not.toBe(leaderValidation?.token)
    expect(followerValidation?.previousStatus).toBe('configured')
    expect(leaderValidation?.previousStatus).toBe('configured')

    await followerStore.restoreProviderStatus(remoteProvider.id, followerValidation!.token)
    await leaderStore.finishProviderValidation(remoteProvider.id, leaderValidation!.token, 'invalid')
    await vi.waitFor(() => {
      expect(leaderStore.providers[remoteProvider.id]?.status).toBe('invalid')
      expect(followerStore.providers[remoteProvider.id]?.status).toBe('invalid')
    })

    await leaderStore.setProviderStatus(remoteProvider.id, 'configured')
    const staleValidation = await followerStore.beginProviderValidation(remoteProvider.id)
    await leaderStore.setProviderStatus(remoteProvider.id, 'bypassed')
    await expect(followerStore.finishProviderValidation(remoteProvider.id, staleValidation!.token, 'invalid')).resolves.toBe(false)
    const nextValidation = await followerStore.beginProviderValidation(remoteProvider.id)
    expect(nextValidation?.previousStatus).toBe('bypassed')
    await followerStore.restoreProviderStatus(remoteProvider.id, nextValidation!.token)
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3920910268
  it('finishes a caller-owned validation token without waiting for follower replication for PR #2435', async () => {
    // ROOT CAUSE:
    //
    // A synchronized follower action does not return the leader action value.
    // The settings page needs a caller-owned token that survives delegation.
    const namespace = `provider-config-validation-token:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useProviderConfigStore()
    await leaderStore.ensureProvider(localProvider.id, localProvider.definitionId)
    await leaderStore.setProviderStatus(localProvider.id, 'configured')

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const validationToken = crypto.randomUUID()
    await followerStore.beginProviderValidation(localProvider.id, validationToken)
    const validatedConfig = { apiKey: 'sk-follower' }
    await followerStore.finishProviderValidationAndUpdateConfig(localProvider.id, validationToken, validatedConfig)
    await vi.waitFor(() => {
      expect(leaderStore.providerValidationLeases[localProvider.id]).toBeUndefined()
      expect(followerStore.providerValidationLeases[localProvider.id]).toBeUndefined()
      expect(followerStore.providers[localProvider.id]?.status).toBe('configured')
      expect(leaderStore.providers[localProvider.id]?.config).toEqual(validatedConfig)
      expect(followerStore.providers[localProvider.id]?.config).toEqual(validatedConfig)
    })
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3914588970
  it('serializes a creation reconciliation patch before a later follower save for PR #2435', async () => {
    // ROOT CAUSE:
    //
    // The creation reconciliation PATCH and a later settings PATCH can run at
    // the same time. The older response can then replace the newer remote data.
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

    const namespace = `provider-config-write-order:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useProviderConfigStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const creation = followerStore.synchronizeAddedProvider({ ...localProvider })
    await vi.waitFor(() => expect(leaderStore.providers[localProvider.id]).toBeDefined())
    await followerStore.setProviderStatus(localProvider.id, 'configured')
    resolveCreate(remoteProvider)
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())

    const latestConfig = { apiKey: 'sk-latest' }
    const laterSave = followerStore.updateProviderConfig(localProvider.id, latestConfig, 'configured')
    await vi.waitFor(() => {
      expect(leaderStore.providers[remoteProvider.id]?.config).toEqual(latestConfig)
      expect(followerStore.providers[remoteProvider.id]?.config).toEqual(latestConfig)
    })
    expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce()

    resolveReconciliation({ ...remoteProvider, status: 'configured' })
    await creation
    await laterSave

    expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(2)
    expect(mocks.service.patchConfigRemote).toHaveBeenNthCalledWith(
      2,
      mocks.client,
      remoteProvider.id,
      latestConfig,
      'configured',
    )
    await vi.waitFor(() => {
      expect(leaderStore.providers[remoteProvider.id]?.config).toEqual(latestConfig)
      expect(followerStore.providers[remoteProvider.id]?.config).toEqual(latestConfig)
    })
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3932274312
  it('keeps a newer validated status when its queued save fails after reconciliation for PR #2435', async () => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    let resolveReconciliation!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote.mockImplementation(async () => {
      if (mocks.service.patchConfigRemote.mock.calls.length === 1) {
        return await new Promise<InferenceServiceProvider>((resolve) => {
          resolveReconciliation = resolve
        })
      }
      throw new Error('validated save failed')
    })

    const namespace = `provider-config-reconciliation-failed-validation-save:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useProviderConfigStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const creation = followerStore.synchronizeAddedProvider({ ...localProvider })
    await vi.waitFor(() => expect(leaderStore.providers[localProvider.id]).toBeDefined())
    await followerStore.setProviderStatus(localProvider.id, 'configured')
    resolveCreate(remoteProvider)
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())

    const validationToken = crypto.randomUUID()
    await followerStore.beginProviderValidation(remoteProvider.id, validationToken)
    const validation = followerStore.finishProviderValidationAndUpdateConfig(
      remoteProvider.id,
      validationToken,
      { apiKey: 'sk-validated' },
    )
    await vi.waitFor(() => expect(leaderStore.providers[remoteProvider.id]?.status).toBe('configured'))

    resolveReconciliation({ ...remoteProvider, status: 'bypassed' })
    await creation
    await validation

    expect(mocks.service.patchConfigRemote).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => {
      expect(leaderStore.providers[remoteProvider.id]?.status).toBe('configured')
      expect(followerStore.providers[remoteProvider.id]?.status).toBe('configured')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3930758343
  it.each([
    { expectedStatus: 'validating', responseStatus: 'configured', validationState: 'active' },
    { expectedStatus: 'invalid', responseStatus: 'configured', validationState: 'completed' },
    { expectedStatus: 'bypassed', responseStatus: 'bypassed', validationState: 'none' },
  ] as const)('preserves $validationState validation state during creation reconciliation for PR #2435', async ({ expectedStatus, responseStatus, validationState }) => {
    let resolveCreate!: (provider: InferenceServiceProvider) => void
    let resolveReconciliation!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveCreate = resolve
    }))
    mocks.service.patchConfigRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveReconciliation = resolve
    }))

    const namespace = `provider-config-reconciliation-validation:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useProviderConfigStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const creation = followerStore.synchronizeAddedProvider({ ...localProvider })
    await vi.waitFor(() => expect(leaderStore.providers[localProvider.id]).toBeDefined())
    await followerStore.setProviderStatus(localProvider.id, 'configured')
    resolveCreate(remoteProvider)
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())

    const validationToken = validationState === 'none' ? undefined : crypto.randomUUID()
    if (validationToken) {
      await followerStore.beginProviderValidation(remoteProvider.id, validationToken)
      await vi.waitFor(() => {
        expect(leaderStore.providerValidationLeases[remoteProvider.id]?.token).toBe(validationToken)
        expect(leaderStore.providers[remoteProvider.id]?.status).toBe('validating')
      })
    }

    if (validationState === 'completed' && validationToken) {
      await followerStore.finishProviderValidation(remoteProvider.id, validationToken, 'invalid')
      await vi.waitFor(() => {
        expect(leaderStore.providerValidationLeases[remoteProvider.id]).toBeUndefined()
        expect(leaderStore.providers[remoteProvider.id]?.status).toBe('invalid')
      })
    }

    resolveReconciliation({ ...remoteProvider, status: responseStatus })
    await creation

    await vi.waitFor(() => {
      expect(leaderStore.providers[remoteProvider.id]?.status).toBe(expectedStatus)
      expect(followerStore.providers[remoteProvider.id]?.status).toBe(expectedStatus)
    })

    if (validationState !== 'active' || !validationToken)
      return

    expect(leaderStore.providerValidationLeases[remoteProvider.id]?.token).toBe(validationToken)
    await followerStore.finishProviderValidation(remoteProvider.id, validationToken, 'configured')
    await vi.waitFor(() => {
      expect(leaderStore.providerValidationLeases[remoteProvider.id]).toBeUndefined()
      expect(leaderStore.providers[remoteProvider.id]?.status).toBe('configured')
      expect(followerStore.providers[remoteProvider.id]?.status).toBe('configured')
    })
  })

  it('restores an active validation after leader failover', async () => {
    mocks.service.buildLocal.mockReturnValue(localProvider)
    const namespace = `provider-config-failover:${crypto.randomUUID()}`
    const firstContext = createSyncedContext(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(firstContext.runtime.isLeader()).toBe(true))
    setActivePinia(firstContext.pinia)
    const firstStore = useProviderConfigStore()
    await firstStore.ensureProvider(localProvider.id, localProvider.definitionId)
    await firstStore.setProviderStatus(localProvider.id, 'configured')

    const secondContext = createSyncedContext(namespace, 'follower-preferred')
    setActivePinia(secondContext.pinia)
    const secondStore = useProviderConfigStore()
    await vi.waitFor(() => expect(secondContext.runtime.getLeaderId()).toBe(firstContext.runtime.participantId))

    const validationLease = await secondStore.beginProviderValidation(localProvider.id)
    await vi.waitFor(() => {
      expect(secondStore.providerValidationLeases[localProvider.id]?.token).toBe(validationLease?.token)
      expect(secondStore.providers[localProvider.id]?.status).toBe('validating')
    })

    firstContext.runtime.dispose()
    await vi.waitFor(() => expect(secondContext.runtime.isLeader()).toBe(true))
    await secondStore.restoreProviderStatus(localProvider.id, validationLease!.token)
    expect(secondStore.providers[localProvider.id]?.status).toBe('configured')
  })

  it('does not restore a provider when reset runs during creation', async () => {
    let resolveRemote!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveRemote = resolve
    }))
    mocks.service.deleteRemote.mockResolvedValue(undefined)

    const context = createSyncedContext(`provider-config-reset-creation:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useProviderConfigStore()

    const creation = store.synchronizeAddedProvider({ ...localProvider })
    await vi.waitFor(() => expect(store.providers[localProvider.id]).toBeDefined())
    await store.resetProviders()
    resolveRemote(remoteProvider)
    await creation

    expect(store.providers[localProvider.id]).toBeUndefined()
    expect(store.providers[remoteProvider.id]).toBeUndefined()
    expect(store.addedProviders[localProvider.id]).toBeUndefined()
    expect(store.addedProviders[remoteProvider.id]).toBeUndefined()
    expect(store.providerCreationResolutions[localProvider.id]).toBeUndefined()
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(mocks.client, remoteProvider.id)
  })

  it('removes a remote provider when reset runs during creation reconciliation', async () => {
    let resolveRemote!: (provider: InferenceServiceProvider) => void
    let resolvePatch!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveRemote = resolve
    }))
    mocks.service.patchConfigRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolvePatch = resolve
    }))
    mocks.service.deleteRemote.mockResolvedValue(undefined)

    const context = createSyncedContext(`provider-config-reset-reconciliation:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useProviderConfigStore()

    const creation = store.synchronizeAddedProvider({ ...localProvider })
    await vi.waitFor(() => expect(store.providers[localProvider.id]).toBeDefined())
    await store.setProviderStatus(localProvider.id, 'configured')
    resolveRemote({ ...localProvider, status: 'unconfigured' })
    await vi.waitFor(() => expect(mocks.service.patchConfigRemote).toHaveBeenCalledOnce())

    await store.resetProviders()
    resolvePatch({ ...localProvider, status: 'configured' })
    await creation

    expect(store.providers[localProvider.id]).toBeUndefined()
    expect(store.addedProviders[localProvider.id]).toBeUndefined()
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(mocks.client, localProvider.id)
  })

  it('migrates active validation and deletion across a resolved provider id', async () => {
    let resolveRemote!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveRemote = resolve
    }))
    mocks.service.patchConfigRemote.mockImplementation(async (
      _client: unknown,
      providerId: string,
      config: Record<string, unknown>,
    ) => ({
      ...remoteProvider,
      id: providerId,
      config: { ...config },
      status: 'unconfigured',
    }))
    mocks.service.deleteRemote.mockResolvedValue(undefined)

    const context = createSyncedContext(`provider-config-id-resolution:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useProviderConfigStore()

    const creation = store.synchronizeAddedProvider({ ...localProvider })
    await vi.waitFor(() => expect(store.providers[localProvider.id]).toBeDefined())
    const validationLease = await store.beginProviderValidation(localProvider.id)
    resolveRemote(remoteProvider)
    await creation

    expect(mocks.service.patchConfigRemote).not.toHaveBeenCalled()
    expect(resolveProviderCreationId(store.providerCreationResolutions, localProvider.id)).toBe(remoteProvider.id)
    expect(store.providerValidationLeases[localProvider.id]).toBeUndefined()
    expect(store.providerValidationLeases[remoteProvider.id]?.token).toBe(validationLease?.token)
    expect(store.providers[remoteProvider.id]?.status).toBe('validating')
    await expect(store.finishProviderValidation(localProvider.id, validationLease!.token, 'configured')).resolves.toBe(true)
    expect(store.providers[remoteProvider.id]?.status).toBe('configured')

    await store.removeProvider(localProvider.id)
    expect(store.providers[remoteProvider.id]).toBeUndefined()
    expect(resolveProviderCreationId(store.providerCreationResolutions, localProvider.id)).toBe(localProvider.id)
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(mocks.client, remoteProvider.id)
  })

  it('preserves an unsaved editor draft when creation resolves to a different id', async () => {
    let resolveRemote!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveRemote = resolve
    }))

    const context = createSyncedContext(`provider-config-draft-id-resolution:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useProviderConfigStore()
    const creation = store.synchronizeAddedProvider({
      ...localProvider,
      config: { baseUrl: 'https://saved.example' },
    })
    await vi.waitFor(() => expect(store.providers[localProvider.id]).toBeDefined())

    const routeProviderId = ref(localProvider.id)
    const providerConfig = computed(() => store.getProvider(routeProviderId.value)!)
    const { cloned: draft, sync } = useCloned(providerConfig, { manual: true })
    const sourceKey = computed(() => createProviderDraftSourceKey(providerConfig.value))
    watch(sourceKey, sync, { immediate: true })
    draft.value.config.baseUrl = 'https://unsaved.example'

    resolveRemote({
      ...remoteProvider,
      config: { baseUrl: 'https://saved.example' },
    })
    await creation
    routeProviderId.value = remoteProvider.id
    await vi.waitFor(() => expect(resolveProviderCreationId(store.providerCreationResolutions, localProvider.id)).toBe(remoteProvider.id))

    expect(draft.value.config.baseUrl).toBe('https://unsaved.example')
  })

  it('keeps an active validation authoritative when same-id creation resolves', async () => {
    let resolveRemote!: (provider: InferenceServiceProvider) => void
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveRemote = resolve
    }))
    mocks.service.patchConfigRemote.mockImplementation(async (
      _client: unknown,
      providerId: string,
      config: Record<string, unknown>,
    ) => ({
      ...localProvider,
      id: providerId,
      config: { ...config },
      status: 'unconfigured',
    }))

    const namespace = `provider-config-creation-validation:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useProviderConfigStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const creation = followerStore.synchronizeAddedProvider({ ...localProvider })
    await vi.waitFor(() => {
      expect(leaderStore.providers[localProvider.id]).toBeDefined()
      expect(followerStore.providers[localProvider.id]).toBeDefined()
    })
    const validationLease = await followerStore.beginProviderValidation(localProvider.id)
    await vi.waitFor(() => {
      expect(leaderStore.providers[localProvider.id]?.status).toBe('validating')
      expect(followerStore.providers[localProvider.id]?.status).toBe('validating')
    })

    resolveRemote({
      ...localProvider,
      config: { serverDefault: true },
    })
    await creation

    await vi.waitFor(() => {
      expect(mocks.service.patchConfigRemote).not.toHaveBeenCalled()
      expect(leaderStore.providerValidationLeases[localProvider.id]?.token).toBe(validationLease?.token)
      expect(leaderStore.providers[localProvider.id]?.config).toEqual({ serverDefault: true })
      expect(leaderStore.providers[localProvider.id]?.status).toBe('validating')
      expect(followerStore.providers[localProvider.id]?.status).toBe('validating')
    })
    await expect(followerStore.finishProviderValidation(localProvider.id, validationLease!.token, 'configured')).resolves.toBe(true)
    await vi.waitFor(() => {
      expect(leaderStore.providers[localProvider.id]?.status).toBe('configured')
      expect(followerStore.providers[localProvider.id]?.status).toBe('configured')
    })
  })

  it('restores an active validation after the synchronization domain restarts', async () => {
    const firstContext = createSyncedContext(`provider-config-restart-before:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(firstContext.runtime.isLeader()).toBe(true))
    setActivePinia(firstContext.pinia)
    const firstStore = useProviderConfigStore()
    await firstStore.ensureProvider(localProvider.id, localProvider.definitionId)
    await firstStore.setProviderStatus(localProvider.id, 'configured')
    await firstStore.beginProviderValidation(localProvider.id)
    firstContext.runtime.dispose()
    disposePinia(firstContext.pinia)

    const restartedContext = createSyncedContext(`provider-config-restart-after:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(restartedContext.runtime.isLeader()).toBe(true))
    setActivePinia(restartedContext.pinia)
    const restartedStore = useProviderConfigStore()
    expect(restartedStore.providers[localProvider.id]?.status).toBe('configured')
    expect(restartedStore.providerValidationLeases[localProvider.id]).toBeUndefined()
  })
})
