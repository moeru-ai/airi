import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(listModels).not.toHaveBeenCalled()
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
