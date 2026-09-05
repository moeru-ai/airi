import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Session, User } from 'better-auth'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '../../libs/providers/providers/official'
import { useAuthStore } from '../auth'
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

  afterEach(() => {
    vi.unstubAllGlobals()
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
      defaultModel: null,
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

  it('routes a configured FunASR instance to its own editor', async () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    const providerId = 'funasr-instance'
    configStore.ensureProvider(providerId, 'funasr-audio-transcription', {
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })
    configStore.setProviderStatus(providerId, 'configured')

    await vi.waitFor(() => {
      expect(store.availableProvidersMetadata.find(provider => provider.id === providerId)?.to)
        .toBe(`/v2/settings/providers/edit/${providerId}`)
    })
  })

  it('lists a configured FunASR instance without its unconfigured catalog definition', async () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    const providerId = 'funasr-instance'

    expect(store.moduleTranscriptionProvidersMetadata.map(provider => provider.id))
      .not
      .toContain('funasr-audio-transcription')

    configStore.ensureProvider(providerId, 'funasr-audio-transcription', {
      baseUrl: 'http://localhost:8000/v1/',
    })
    configStore.setProviderStatus(providerId, 'configured')

    await vi.waitFor(() => {
      const providerIds = store.moduleTranscriptionProvidersMetadata.map(provider => provider.id)
      expect(providerIds).toContain(providerId)
      expect(providerIds).not.toContain('funasr-audio-transcription')
    })
  })

  it('lists a bypassed FunASR instance without its unconfigured catalog definition', async () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    const providerId = 'funasr-bypassed-instance'

    configStore.ensureProvider(providerId, 'funasr-audio-transcription', {
      baseUrl: 'http://localhost:8000/v1/',
    })
    configStore.setProviderStatus(providerId, 'bypassed')

    await vi.waitFor(() => {
      const providerIds = store.moduleTranscriptionProvidersMetadata.map(provider => provider.id)
      expect(providerIds).toContain(providerId)
      expect(providerIds).not.toContain('funasr-audio-transcription')
    })
  })

  it('preserves the dedicated Web Speech API settings route after configuration', async () => {
    vi.stubGlobal('window', { SpeechRecognition: class {} })
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    const providerId = 'browser-web-speech-api'
    configStore.ensureProvider(providerId, providerId, {})
    configStore.setProviderStatus(providerId, 'configured')

    await vi.waitFor(() => {
      const provider = store.allAudioTranscriptionProvidersMetadata.find(provider => provider.id === providerId)
      expect(provider).toBeDefined()
      expect(provider?.to).toBeUndefined()
    })
  })

  // ROOT CAUSE:
  //
  // Module pages treated every credential-free provider as available before
  // configuration. The official providers also have credential-free local
  // definitions, but their availability belongs to the authenticated session.
  //
  // We fixed this by requiring a configured record for official providers
  // while keeping account-free browser and local providers available.
  it('lists official providers only after authenticated setup configures them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ flux: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useProviderStore()
    const configStore = useProviderConfigStore()

    await vi.waitFor(() => {
      expect(store.moduleSpeechProvidersMetadata.map(provider => provider.id)).toContain('speech-noop')
      expect(store.moduleChatProvidersMetadata.map(provider => provider.id)).not.toContain('official-provider')
      expect(store.moduleSpeechProvidersMetadata.map(provider => provider.id)).not.toContain(OFFICIAL_SPEECH_PROVIDER_ID)
      expect(store.moduleSpeechProvidersMetadata.map(provider => provider.id)).not.toContain(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
      expect(store.moduleTranscriptionProvidersMetadata.map(provider => provider.id)).not.toContain(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
      expect(store.moduleVisionProvidersMetadata.map(provider => provider.id)).not.toContain('vision-official-provider')
    })

    expect(configStore.providers['official-provider']).toBeUndefined()
    expect(configStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]).toBeUndefined()
    expect(configStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]).toBeUndefined()
    expect(configStore.providers['vision-official-provider']).toBeUndefined()

    await store.initializeProvider('official-provider')
    await store.forceProviderConfigured('official-provider')
    await store.initializeProvider(OFFICIAL_SPEECH_PROVIDER_ID)
    await store.forceProviderConfigured(OFFICIAL_SPEECH_PROVIDER_ID)
    await store.initializeProvider(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
    await store.forceProviderConfigured(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
    await store.initializeProvider('vision-official-provider')
    await store.forceProviderConfigured('vision-official-provider')

    expect(store.moduleChatProvidersMetadata.map(provider => provider.id)).not.toContain('official-provider')
    expect(store.moduleSpeechProvidersMetadata.map(provider => provider.id)).not.toContain(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(store.moduleTranscriptionProvidersMetadata.map(provider => provider.id)).not.toContain(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
    expect(store.moduleVisionProvidersMetadata.map(provider => provider.id)).not.toContain('vision-official-provider')

    const user: User = {
      id: 'user-1',
      name: 'AIRI User',
      email: 'user@example.com',
      emailVerified: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    const session: Session = {
      id: 'session-1',
      token: 'server-session-token',
      userId: user.id,
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    useAuthStore().$patch({ user, session })

    expect(store.moduleChatProvidersMetadata.map(provider => provider.id)).toContain('official-provider')
    expect(store.moduleSpeechProvidersMetadata.map(provider => provider.id)).toContain(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(store.moduleSpeechProvidersMetadata.map(provider => provider.id)).not.toContain(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
    expect(store.moduleTranscriptionProvidersMetadata.map(provider => provider.id)).toContain(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
    expect(store.moduleVisionProvidersMetadata.map(provider => provider.id)).toContain('vision-official-provider')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
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

  it('applies provider-owned reasoning options without changing the cached provider', async () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.ensureProvider('openai', 'openai', {
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1/',
    })

    const baseProvider = await store.getProviderInstance<ChatProvider>('openai')
    const reasoningDisabledProvider = await store.getChatProviderInstance('openai', { reasoning: 'disabled' })
    const reasoningEnabledProvider = await store.getChatProviderInstance('openai', { reasoning: 'enabled' })

    expect(reasoningDisabledProvider).not.toBe(baseProvider)
    expect(reasoningEnabledProvider).not.toBe(baseProvider)
    expect(reasoningDisabledProvider.chat('any-model')).toMatchObject({ reasoningEffort: 'none' })
    expect(reasoningEnabledProvider.chat('any-model')).toMatchObject({ reasoningEffort: 'medium' })
    expect(baseProvider.chat('any-model')).not.toHaveProperty('reasoningEffort')
  })

  it('recreates a cached provider after its saved configuration changes', async () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.ensureProvider('openai', 'openai', {
      apiKey: 'first-key',
      baseUrl: 'https://first.example.com/v1/',
    })

    const first = await store.getProviderInstance<ChatProvider>('openai')
    const dispose = vi.fn()
    Object.assign(first, { dispose })

    expect(await store.getProviderInstance<ChatProvider>('openai')).toBe(first)

    configStore.providers.openai!.config = {
      apiKey: 'second-key',
      baseUrl: 'https://second.example.com/v1/',
    }

    expect(await store.getProviderInstance<ChatProvider>('openai')).not.toBe(first)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('shares one provider replacement across concurrent callers', async () => {
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.ensureProvider('openai', 'openai', {
      apiKey: 'first-key',
      baseUrl: 'https://first.example.com/v1/',
    })

    const first = await store.getProviderInstance<ChatProvider>('openai')
    let releaseDispose!: () => void
    const disposeGate = new Promise<void>((resolve) => {
      releaseDispose = resolve
    })
    const dispose = vi.fn(() => disposeGate)
    Object.assign(first, { dispose })

    configStore.providers.openai!.config = {
      apiKey: 'second-key',
      baseUrl: 'https://second.example.com/v1/',
    }

    const firstReplacement = store.getProviderInstance<ChatProvider>('openai')
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    const secondReplacement = store.getProviderInstance<ChatProvider>('openai')
    await new Promise<void>(resolve => queueMicrotask(resolve))
    releaseDispose()

    const [firstResult, secondResult] = await Promise.all([firstReplacement, secondReplacement])
    expect(secondResult).toBe(firstResult)
    expect(dispose).toHaveBeenCalledOnce()
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
      defaultModel: null,
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
