import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { OFFICIAL_SPEECH_PROVIDER_ID } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from './config'
import { useProviderStore } from './provider'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('provider store synchronization boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  // ROOT CAUSE:
  //
  // Provider actions, serializable runtime data, and computedAsync output
  // shared one synced store. Applying the derived ref in every Electron
  // renderer restarted its local async computation, which proposed another
  // snapshot and starved the main window's event loop.
  //
  // We fixed this by keeping executable actions in the provider store and
  // placing the replicated data in an internal state-only store.
  it('keeps replicated runtime data out of the executable provider store state', () => {
    const store = useProviderStore()
    const runtimeState = {
      models: [],
      modelStatus: 'ready' as const,
      modelError: null,
    }

    store.providerRuntimeState.openai = runtimeState

    expect(store.$state).not.toHaveProperty('providerRuntimeState')
    expect(store.$state).not.toHaveProperty('providerAvailabilityOverrides')
    expect(store.providerRuntimeState.openai).toEqual(runtimeState)
  })

  // ROOT CAUSE:
  //
  // The provider store installed immediate watchers that called synchronized
  // background actions. Every renderer created the same watchers, so one
  // shared state transition produced one routed action per renderer.
  //
  // We fixed this by keeping background work behind explicit action calls.
  it('does not start background provider actions when shared configuration changes', async () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()

    await nextTick()
    await new Promise<void>(resolve => queueMicrotask(resolve))

    const refreshValidation = vi.spyOn(store, 'refreshListedProviderValidation').mockResolvedValue()
    const refreshModels = vi.spyOn(store, 'refreshModelsForChangedCredentials').mockResolvedValue()

    configStore.ensureProvider('openai', 'openai', { apiKey: 'test-key' })
    await nextTick()
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(refreshValidation).not.toHaveBeenCalled()
    expect(refreshModels).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // Provider metadata projection called the config store's `getProvider`
  // action once for every registered provider. Pinia tracing and plugins then
  // processed hundreds of action lifecycle events during renderer startup,
  // even though each call was only a read.
  // Internal provider projections now read the reactive provider map directly.
  it('does not dispatch config actions while projecting provider metadata', async () => {
    const configStore = useProviderConfigStore()
    let getProviderCalls = 0
    configStore.$onAction(({ name }) => {
      if (name === 'getProvider')
        getProviderCalls += 1
    })

    useProviderStore()
    await nextTick()

    expect(getProviderCalls).toBe(0)
  })

  // ROOT CAUSE:
  //
  // getModelsForProvider created a new empty array for every cache miss.
  // Reactive consumers observed a false list change after each synced patch.
  //
  // We fixed this by returning one frozen fallback until a catalog exists.
  it('reuses the empty model-list fallback', () => {
    const store = useProviderStore()

    const first = store.getModelsForProvider('missing-provider')
    const second = store.getModelsForProvider('missing-provider')

    expect(second).toBe(first)
    expect(second).toEqual([])
  })

  // ROOT CAUSE:
  //
  // A model request kept a reference to its runtime entry across an await.
  // A synced snapshot replaced that entry before the request completed. The
  // request then wrote ready to the detached entry and left the current entry
  // in loading state.
  it('updates the current runtime entry after a synced snapshot replaces it', async () => {
    const store = useProviderStore()
    const request = store.fetchModelsForProvider('official-provider')

    expect(store.providerRuntimeState['official-provider']?.modelStatus).toBe('loading')

    store.providerRuntimeState['official-provider'] = {
      models: [],
      modelStatus: 'loading',
      modelError: null,
    }

    await request

    expect(store.providerRuntimeState['official-provider']?.modelStatus).toBe('ready')
    expect(store.providerRuntimeState['official-provider']?.modelError).toBeNull()
    expect(store.providerRuntimeState['official-provider']?.models).toEqual([
      expect.objectContaining({ id: 'auto' }),
    ])
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3757074245
  it('does not refresh models when only the selected model changes (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    store.initializeProvider(providerId)
    await new Promise(resolve => setTimeout(resolve, 0))
    configStore.setProviderStatus(providerId, 'configured')
    await store.refreshModelsForChangedCredentials()
    expect(configStore.getProvider(providerId)?.status).toBe('configured')

    const listModels = vi.spyOn(store.getProviderDefinition(providerId).extraMethods!, 'listModels')
    configStore.getProviderConfig(providerId)!.model = 'paraformer'
    await store.refreshModelsForChangedCredentials()

    expect(listModels).not.toHaveBeenCalled()
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3792335745
  it('does not refresh OpenAI models when only the selected model changes (GitHub #2122)', async () => {
    const providerId = 'openai-audio-transcription'
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    store.initializeProvider(providerId)
    configStore.getProviderConfig(providerId)!.apiKey = 'test-key'
    await new Promise(resolve => setTimeout(resolve, 0))
    configStore.setProviderStatus(providerId, 'configured')
    await store.refreshModelsForChangedCredentials()
    expect(configStore.getProvider(providerId)?.status).toBe('configured')

    const listModels = vi.spyOn(store.getProviderDefinition(providerId).extraMethods!, 'listModels')
    configStore.getProviderConfig(providerId)!.model = 'whisper-1'
    await store.refreshModelsForChangedCredentials()

    expect(listModels).not.toHaveBeenCalled()
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3792532254
  it('matches fixed model catalogs through a configured provider definition (GitHub #2122)', async () => {
    const providerId = 'local-funasr-instance'
    const definitionId = 'funasr-audio-transcription'
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.ensureProvider(providerId, definitionId, {
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })
    store.initializeProvider(providerId)
    await new Promise(resolve => setTimeout(resolve, 0))
    configStore.setProviderStatus(providerId, 'configured')
    await store.refreshModelsForChangedCredentials()
    await new Promise(resolve => setTimeout(resolve, 0))

    const providerInstance = await store.getProviderInstance(providerId)
    const listModels = vi.spyOn(store.getProviderDefinition(definitionId).extraMethods!, 'listModels')
    configStore.getProviderConfig(providerId)!.model = 'paraformer'
    await store.refreshModelsForChangedCredentials()

    expect(listModels).not.toHaveBeenCalled()
    expect(await store.getProviderInstance(providerId)).toBe(providerInstance)
  })

  it('does not validate a legacy provider only because a new default field is absent', async () => {
    const providerId = 'openai-audio-transcription'
    const configStore = useProviderConfigStore()
    configStore.ensureProvider(providerId, providerId, {
      baseUrl: 'https://api.openai.com/v1/',
    })
    const store = useProviderStore()
    await new Promise(resolve => setTimeout(resolve, 0))
    store.initializeProvider(providerId)
    expect(store.getDefaultProviderConfig(providerId)).toEqual({
      baseUrl: 'https://api.openai.com/v1/',
      model: 'gpt-4o-transcribe',
    })

    const config = configStore.getProviderConfig(providerId)!
    configStore.unmarkProviderAdded(providerId)
    configStore.setProviderStatus(providerId, 'unconfigured')

    await store.refreshListedProviderValidation()
    expect(configStore.getProvider(providerId)?.status).toBe('unconfigured')

    config.apiKey = 'changed'
    await store.refreshListedProviderValidation()
    expect(configStore.getProvider(providerId)?.status).toBe('configured')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3757361703
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3761020549
  it('keeps a stale model request from overwriting the latest provider cache (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    store.initializeProvider(providerId)
    Object.assign(configStore.getProviderConfig(providerId)!, {
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })

    const definition = store.getProviderDefinition(providerId)
    const listModels = definition.extraMethods?.listModels
    if (!listModels)
      throw new Error('Expected FunASR model listing support')

    type ListedModels = Awaited<ReturnType<typeof listModels>>
    let resolveFirstRequest!: (models: ListedModels) => void
    let resolveSecondRequest!: (models: ListedModels) => void
    const firstRequest = new Promise<ListedModels>((resolve) => {
      resolveFirstRequest = resolve
    })
    const secondRequest = new Promise<ListedModels>((resolve) => {
      resolveSecondRequest = resolve
    })
    let requestCount = 0
    vi.spyOn(definition.extraMethods!, 'listModels').mockImplementation(async () => {
      requestCount++
      return requestCount === 1 ? firstRequest : secondRequest
    })

    const staleLoad = store.fetchModelsForProvider(providerId)
    await vi.waitFor(() => expect(requestCount).toBe(1))
    const freshLoad = store.fetchModelsForProvider(providerId)
    await vi.waitFor(() => expect(requestCount).toBe(2))

    resolveSecondRequest([{
      id: 'fresh-model',
      name: 'Fresh model',
      provider: providerId,
      description: '',
      contextLength: 0,
      deprecated: false,
    }])
    await freshLoad
    expect(store.getModelsForProvider(providerId).map(model => model.id)).toEqual(['fresh-model'])

    resolveFirstRequest([{
      id: 'stale-model',
      name: 'Stale model',
      provider: providerId,
      description: '',
      contextLength: 0,
      deprecated: false,
    }])
    const staleResult = await staleLoad
    expect(staleResult.map(model => model.id)).toEqual(['fresh-model'])
    expect(() => structuredClone(staleResult)).not.toThrow()
    expect(store.getModelsForProvider(providerId).map(model => model.id)).toEqual(['fresh-model'])
    expect(store.providerRuntimeState[providerId]?.modelStatus).toBe('ready')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3761872565
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3761935865
  it('waits for the owning model request instead of returning an old cache (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    store.initializeProvider(providerId)
    Object.assign(configStore.getProviderConfig(providerId)!, {
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })

    const definition = store.getProviderDefinition(providerId)
    const listModels = definition.extraMethods?.listModels
    if (!listModels)
      throw new Error('Expected FunASR model listing support')

    type ListedModels = Awaited<ReturnType<typeof listModels>>
    let resolveStaleRequest!: (models: ListedModels) => void
    let resolveOwningRequest!: (models: ListedModels) => void
    const staleRequest = new Promise<ListedModels>((resolve) => {
      resolveStaleRequest = resolve
    })
    const owningRequest = new Promise<ListedModels>((resolve) => {
      resolveOwningRequest = resolve
    })
    let requestCount = 0
    vi.spyOn(definition.extraMethods!, 'listModels').mockImplementation(async () => {
      requestCount++
      if (requestCount === 1) {
        return [{
          id: 'old-endpoint-model',
          name: 'Old endpoint model',
          provider: providerId,
          description: '',
          contextLength: 0,
          deprecated: false,
        }]
      }
      return requestCount === 2 ? staleRequest : owningRequest
    })

    await store.fetchModelsForProvider(providerId)
    const staleLoad = store.fetchModelsForProvider(providerId)
    let staleLoadSettled = false
    const staleResult = staleLoad.then((models) => {
      staleLoadSettled = true
      return models
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
    const owningLoad = store.fetchModelsForProvider(providerId)
    await vi.waitFor(() => expect(requestCount).toBe(3))

    resolveStaleRequest([{
      id: 'stale-model',
      name: 'Stale model',
      provider: providerId,
      description: '',
      contextLength: 0,
      deprecated: false,
    }])
    await new Promise(resolve => setTimeout(resolve, 0))
    const staleLoadSettledBeforeOwner = staleLoadSettled
    expect(store.getModelsForProvider(providerId).map(model => model.id)).toEqual(['old-endpoint-model'])
    expect(store.providerRuntimeState[providerId]?.modelStatus).toBe('loading')

    resolveOwningRequest([{
      id: 'fresh-model',
      name: 'Fresh model',
      provider: providerId,
      description: '',
      contextLength: 0,
      deprecated: false,
    }])
    expect((await owningLoad).map(model => model.id)).toEqual(['fresh-model'])
    expect(staleLoadSettledBeforeOwner).toBe(false)
    expect((await staleResult).map(model => model.id)).toEqual(['fresh-model'])
    expect(store.getModelsForProvider(providerId).map(model => model.id)).toEqual(['fresh-model'])
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3761020555
  it('returns the fresh model snapshot when a stale request fails (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    store.initializeProvider(providerId)
    Object.assign(configStore.getProviderConfig(providerId)!, {
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })

    const definition = store.getProviderDefinition(providerId)
    const listModels = definition.extraMethods?.listModels
    if (!listModels)
      throw new Error('Expected FunASR model listing support')

    type ListedModels = Awaited<ReturnType<typeof listModels>>
    let rejectFirstRequest!: (reason?: unknown) => void
    let resolveSecondRequest!: (models: ListedModels) => void
    const firstRequest = new Promise<ListedModels>((_resolve, reject) => {
      rejectFirstRequest = reject
    })
    const secondRequest = new Promise<ListedModels>((resolve) => {
      resolveSecondRequest = resolve
    })
    let requestCount = 0
    vi.spyOn(definition.extraMethods!, 'listModels').mockImplementation(async () => {
      requestCount++
      return requestCount === 1 ? firstRequest : secondRequest
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const staleLoad = store.fetchModelsForProvider(providerId)
      let staleLoadSettled = false
      const staleResult = staleLoad.then((models) => {
        staleLoadSettled = true
        return models
      })
      await vi.waitFor(() => expect(requestCount).toBe(1))
      const freshLoad = store.fetchModelsForProvider(providerId)
      await vi.waitFor(() => expect(requestCount).toBe(2))

      const staleError = new Error('stale request failed')
      rejectFirstRequest(staleError)
      await new Promise(resolve => setTimeout(resolve, 0))
      const staleLoadSettledBeforeOwner = staleLoadSettled

      resolveSecondRequest([{
        id: 'fresh-model',
        name: 'Fresh model',
        provider: providerId,
        description: '',
        contextLength: 0,
        deprecated: false,
      }])
      await freshLoad

      const models = await staleResult

      expect(staleLoadSettledBeforeOwner).toBe(false)
      expect(models.map(model => model.id)).toEqual(['fresh-model'])
      expect(() => structuredClone(models)).not.toThrow()
      expect(store.providerRuntimeState[providerId]?.modelStatus).toBe('ready')
      expect(store.providerRuntimeState[providerId]?.modelError).toBeNull()
      expect(consoleError).toHaveBeenCalledWith(`Error fetching models for ${providerId}:`, staleError)
    }
    finally {
      consoleError.mockRestore()
    }
  })

  // ROOT CAUSE:
  //
  // Speech startup previously had both an immediate watcher and a mounted
  // refresh. Multiple renderers could also request the same catalog through
  // the synchronized provider action. Each caller created its own request.
  //
  // We keep one leader-owned request per provider, model, and configuration
  // until it settles, so concurrent callers share the same result.
  it('shares concurrent voice catalog requests', async () => {
    const store = useProviderStore()
    let resolveRequest: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const first = store.listProviderVoices(OFFICIAL_SPEECH_PROVIDER_ID, 'auto')
      const second = store.listProviderVoices(OFFICIAL_SPEECH_PROVIDER_ID, 'auto')

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      resolveRequest?.(new Response(JSON.stringify({ voices: [], recommended: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      await expect(Promise.all([first, second])).resolves.toEqual([[], []])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
