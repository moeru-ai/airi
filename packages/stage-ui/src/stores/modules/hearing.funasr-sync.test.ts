import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { hasExplicitlyClearedTranscriptionModel, useHearingStore } from './hearing'

const TRANSCRIPTION_PROVIDER_IDS = [
  'funasr-audio-transcription',
  'mimo-audio-transcription',
  'openai-compatible-audio-transcription',
  'openai-audio-transcription',
  'browser-web-speech-api',
] as const

const { persistedSettings } = vi.hoisted(() => ({
  persistedSettings: new Map<string, unknown>(),
}))

vi.mock('@proj-airi/stage-shared/composables', async (importOriginal) => {
  const original = await importOriginal<typeof import('@proj-airi/stage-shared/composables')>()
  const { ref } = await import('vue')

  return {
    ...original,
    useLocalStorageManualReset: <T>(key: string, initialValue: T) => {
      const state = ref(persistedSettings.has(key) ? persistedSettings.get(key) as T : initialValue)
      return Object.assign(state, {
        reset: () => {
          state.value = initialValue as typeof state.value
        },
      })
    },
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en' },
    t: (key: string) => key,
  }),
}))

vi.mock('../../composables/use-analytics', () => ({
  useAnalytics: () => new Proxy({}, { get: () => () => {} }),
}))

describe('funASR Hearing model synchronization', () => {
  beforeEach(async () => {
    persistedSettings.clear()
    setActivePinia(createPinia())

    const providersStore = useProviderStore()
    for (const providerId of TRANSCRIPTION_PROVIDER_IDS)
      await providersStore.initializeProvider(providerId)
  })

  it('hydrates FunASR models when Hearing starts with the provider persisted', async () => {
    persistedSettings.set('settings/hearing/active-provider', 'funasr-audio-transcription')

    const providersStore = useProviderStore()
    const hearingStore = useHearingStore()
    await hearingStore.initialize()

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
      expect(providersStore.getModelsForProvider('funasr-audio-transcription').map(model => model.id)).toEqual([
        'sensevoice',
        'fun-asr-nano',
        'paraformer',
      ])
    })
  })

  it('configures FunASR when selected before its settings page is opened (GitHub #2122)', async () => {
    const providersStore = useProviderStore()
    await providersStore.resetProviderSettings()

    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()
    expect(providerConfigStore.getProvider('funasr-audio-transcription')).toBeUndefined()

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')

    expect(providerConfigStore.getProvider('funasr-audio-transcription')).toMatchObject({
      status: 'configured',
      config: {
        baseUrl: 'http://localhost:8000/v1/',
        model: 'sensevoice',
      },
    })
    expect(hearingStore.configured).toBe(true)
  })

  it('configures a generated FunASR instance when selected (GitHub #2122)', async () => {
    const providerId = 'generated-funasr-transcription'
    const providerConfigStore = useProviderConfigStore()
    providerConfigStore.ensureProvider(providerId, 'funasr-audio-transcription', {
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })
    const providersStore = useProviderStore()
    await providersStore.initializeProvider(providerId)

    const hearingStore = useHearingStore()
    await hearingStore.setActiveTranscriptionProvider(providerId)

    expect(providerConfigStore.getProvider(providerId)?.status).toBe('configured')
    expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    expect(hearingStore.configured).toBe(true)
  })

  it('configures a persisted generated FunASR instance during startup (GitHub #2122)', async () => {
    const providerId = 'generated-funasr-transcription'
    persistedSettings.set('settings/hearing/active-provider', providerId)
    const providerConfigStore = useProviderConfigStore()
    providerConfigStore.ensureProvider(providerId, 'funasr-audio-transcription', {
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })
    const providersStore = useProviderStore()
    await providersStore.initializeProvider(providerId)

    const hearingStore = useHearingStore()
    await hearingStore.initialize()

    expect(providerConfigStore.getProvider(providerId)?.status).toBe('configured')
    expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    expect(hearingStore.configured).toBe(true)
  })

  it('preserves an explicitly cleared FunASR model on startup', async () => {
    persistedSettings.set('settings/hearing/active-provider', 'funasr-audio-transcription')

    const providerConfigStore = useProviderConfigStore()
    providerConfigStore.getProviderConfig('funasr-audio-transcription')!.model = ''
    const hearingStore = useHearingStore()
    await hearingStore.initialize()

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('')
      expect(providerConfigStore.getProviderConfig('funasr-audio-transcription')?.model).toBe('')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3792335742
  it('hydrates the shared OpenAI default for a legacy provider on startup (GitHub #2122)', async () => {
    persistedSettings.set('settings/hearing/active-provider', 'openai-audio-transcription')
    persistedSettings.set('settings/hearing/active-model', '')

    const providerConfigStore = useProviderConfigStore()
    delete providerConfigStore.getProviderConfig('openai-audio-transcription')!.model

    const hearingStore = useHearingStore()
    await hearingStore.initialize()

    expect(hearingStore.activeTranscriptionModel).toBe('gpt-4o-transcribe')
    expect(providerConfigStore.getProviderConfig('openai-audio-transcription')?.model).toBe('gpt-4o-transcribe')
  })

  it('honors an explicitly cleared OpenAI model over stale Hearing state', async () => {
    persistedSettings.set('settings/hearing/active-provider', 'openai-audio-transcription')
    persistedSettings.set('settings/hearing/active-model', 'whisper-1')

    const providerConfigStore = useProviderConfigStore()
    const providerConfig = providerConfigStore.getProviderConfig('openai-audio-transcription')!
    providerConfig.model = ''

    const hearingStore = useHearingStore()
    await hearingStore.initialize()
    expect(hearingStore.activeTranscriptionModel).toBe('')

    providerConfig.model = 'gpt-4o-mini-transcribe'
    await nextTick()
    providerConfig.model = ''

    expect(hearingStore.activeTranscriptionModel).toBe('')
  })

  it('does not select a listed fallback for an explicitly cleared model', () => {
    expect(hasExplicitlyClearedTranscriptionModel({ model: '' })).toBe(true)
    expect(hasExplicitlyClearedTranscriptionModel({ model: '   ' })).toBe(true)
    expect(hasExplicitlyClearedTranscriptionModel({})).toBe(false)
    expect(hasExplicitlyClearedTranscriptionModel({ model: 'gpt-4o-transcribe' })).toBe(false)
  })

  it('does not reconcile persisted state during store construction', () => {
    persistedSettings.set('settings/hearing/active-provider', 'openai-audio-transcription')
    persistedSettings.set('settings/hearing/active-model', '')
    const providerConfigStore = useProviderConfigStore()
    delete providerConfigStore.getProviderConfig('openai-audio-transcription')!.model

    const hearingStore = useHearingStore()

    expect(hearingStore.activeTranscriptionModel).toBe('')
    expect(providerConfigStore.getProviderConfig('openai-audio-transcription')).not.toHaveProperty('model')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3842341589
  // ROOT CAUSE:
  //
  // Initialization restored a persisted provider model but returned before loading that
  // provider's model catalog, leaving the Hearing model selector empty after a full reload.
  it('loads the persisted generated provider catalog during Hearing initialization (GitHub #2122)', async () => {
    const providerId = 'generated-openai-audio-transcription'
    persistedSettings.set('settings/hearing/active-provider', providerId)

    const providerConfigStore = useProviderConfigStore()
    providerConfigStore.ensureProvider(providerId, 'openai-audio-transcription', {
      apiKey: 'test-key',
      model: 'gpt-4o-transcribe',
    })
    const providersStore = useProviderStore()
    await providersStore.initializeProvider(providerId)
    const fetchModels = vi.spyOn(providersStore, 'fetchModelsForProvider').mockResolvedValue([{
      id: 'gpt-4o-transcribe',
      name: 'GPT-4o Transcribe',
      provider: providerId,
    }])

    const hearingStore = useHearingStore()
    await hearingStore.initialize()

    expect(fetchModels).toHaveBeenCalledWith(providerId)
    expect(hearingStore.activeTranscriptionModel).toBe('gpt-4o-transcribe')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3849324778
  // ROOT CAUSE:
  //
  // CometAPI stores its model only in Hearing state. Initialization returned as soon as it
  // found that persisted model, before loading the selected provider's runtime catalog.
  it('loads a catalog when only Hearing has the persisted model (GitHub #2122)', async () => {
    const providerId = 'comet-api-transcription'
    persistedSettings.set('settings/hearing/active-provider', providerId)
    persistedSettings.set('settings/hearing/active-model', 'whisper-1')

    const providerConfigStore = useProviderConfigStore()
    providerConfigStore.ensureProvider(providerId, providerId, {
      apiKey: 'test-key',
      baseUrl: 'https://api.cometapi.com/v1/',
    })
    const providersStore = useProviderStore()
    await providersStore.initializeProvider(providerId)
    const fetchModels = vi.spyOn(providersStore, 'fetchModelsForProvider').mockResolvedValue([{
      id: 'whisper-1',
      name: 'Whisper',
      provider: providerId,
    }])

    const hearingStore = useHearingStore()
    await hearingStore.initialize()

    expect(fetchModels).toHaveBeenCalledWith(providerId)
    expect(hearingStore.activeTranscriptionModel).toBe('whisper-1')
    expect(providerConfigStore.getProviderConfig(providerId)).not.toHaveProperty('model')
  })

  it('loads a fresh catalog when neither persisted state owns a model (GitHub #2122)', async () => {
    const providerId = 'comet-api-transcription'
    persistedSettings.set('settings/hearing/active-provider', providerId)
    persistedSettings.set('settings/hearing/active-model', '')

    const providerConfigStore = useProviderConfigStore()
    providerConfigStore.ensureProvider(providerId, providerId, {
      apiKey: 'test-key',
      baseUrl: 'https://api.cometapi.com/v1/',
    })
    const providersStore = useProviderStore()
    await providersStore.initializeProvider(providerId)
    const fetchModels = vi.spyOn(providersStore, 'fetchModelsForProvider').mockResolvedValue([{
      id: 'whisper-1',
      name: 'Whisper',
      provider: providerId,
    }])

    const hearingStore = useHearingStore()
    await hearingStore.initialize()

    expect(fetchModels).toHaveBeenCalledWith(providerId)
    expect(hearingStore.activeTranscriptionModel).toBe('whisper-1')
  })

  it('restores the FunASR configured model when the provider is selected', async () => {
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()

    providerConfigStore.getProviderConfig('funasr-audio-transcription')!.model = 'paraformer'
    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('paraformer')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3837554086
  // ROOT CAUSE:
  //
  // A provider instance has a generated id. The destination-model resolver compared that id with
  // the OpenAI-compatible definition id, so it did not select the documented `whisper-1` fallback.
  it('restores the OpenAI-compatible fallback for a generated provider (GitHub #2122)', async () => {
    const providerId = 'generated-openai-compatible-transcription'
    const providerConfigStore = useProviderConfigStore()
    const providersStore = useProviderStore()
    providerConfigStore.ensureProvider(providerId, 'openai-compatible-audio-transcription', {
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8000/v1/',
    })
    await providersStore.initializeProvider(providerId)

    const hearingStore = useHearingStore()
    await hearingStore.setActiveTranscriptionProvider(providerId)

    expect(hearingStore.activeTranscriptionModel).toBe('whisper-1')
    expect(providerConfigStore.getProviderConfig(providerId)?.model).toBe('whisper-1')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3834928542
  it('rejects invalid FunASR status in Hearing readiness (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()

    providerConfigStore.getProviderConfig(providerId)!.model = 'sensevoice'
    await hearingStore.setActiveTranscriptionProvider(providerId)
    providerConfigStore.setProviderStatus(providerId, 'invalid')

    expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    expect(hearingStore.configured).toBe(false)

    providerConfigStore.setProviderStatus(providerId, 'configured')
    expect(hearingStore.configured).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3837554091
  // ROOT CAUSE:
  //
  // Hearing compared a generated provider id with the FunASR definition id. The invalid provider
  // therefore remained ready when its selected model was not empty.
  it('rejects invalid generated FunASR status in Hearing readiness (GitHub #2122)', async () => {
    const providerId = 'generated-funasr-transcription'
    const providerConfigStore = useProviderConfigStore()
    const providersStore = useProviderStore()
    providerConfigStore.ensureProvider(providerId, 'funasr-audio-transcription', {
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })
    await providersStore.initializeProvider(providerId)

    const hearingStore = useHearingStore()
    await hearingStore.setActiveTranscriptionProvider(providerId)
    providerConfigStore.setProviderStatus(providerId, 'invalid')

    expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    expect(hearingStore.configured).toBe(false)
  })

  it('persists the active Hearing model into the FunASR provider config', async () => {
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionModel('fun-asr-nano')

    await vi.waitFor(() => {
      expect(providerConfigStore.getProviderConfig('funasr-audio-transcription')?.model).toBe('fun-asr-nano')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3710847051
  it('persists the active Hearing model for every model-backed provider (GitHub #2122)', async () => {
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()

    await hearingStore.setActiveTranscriptionProvider('mimo-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('mimo-v2-omni')
    })

    await hearingStore.setActiveTranscriptionModel('mimo-v2.5')
    await vi.waitFor(() => {
      expect(providerConfigStore.getProviderConfig('mimo-audio-transcription')?.model).toBe('mimo-v2.5')
    })

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider('mimo-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('mimo-v2.5')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3757471642
  it('persists the first custom model for OpenAI-compatible transcription (GitHub #2122)', async () => {
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()
    const providerId = 'openai-compatible-audio-transcription'
    const providerConfig = providerConfigStore.getProviderConfig(providerId)!

    expect(providerConfig).not.toHaveProperty('model')
    await hearingStore.setActiveTranscriptionProvider(providerId)
    await nextTick()

    await hearingStore.setActiveTranscriptionModel('custom/funasr-model')

    await vi.waitFor(() => {
      expect(providerConfig.model).toBe('custom/funasr-model')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3710847062
  it('rehydrates FunASR models when provider settings reset its runtime cache (GitHub #2122)', async () => {
    persistedSettings.set('settings/hearing/active-provider', 'funasr-audio-transcription')

    const providersStore = useProviderStore()
    const hearingStore = useHearingStore()
    await hearingStore.initialize()
    await hearingStore.setActiveTranscriptionModel('paraformer')

    await vi.waitFor(() => {
      expect(providersStore.getModelsForProvider('funasr-audio-transcription')).toHaveLength(3)
    })

    await providersStore.resetProviderSettings()
    const initializeProvider = providersStore.initializeProvider.bind(providersStore)
    let resolveInitialization!: () => void
    vi.spyOn(providersStore, 'initializeProvider').mockImplementation(((providerId: string) => {
      return new Promise<void>((resolve) => {
        resolveInitialization = async () => {
          await initializeProvider(providerId)
          resolve()
        }
      })
    }) as never)

    const reloadPromise = hearingStore.reloadActiveTranscriptionProvider()
    await Promise.resolve()

    expect(hearingStore.activeTranscriptionModel).toBe('paraformer')
    expect(useProviderConfigStore().getProviderConfig('funasr-audio-transcription')).toBeUndefined()

    resolveInitialization()
    await reloadPromise

    await vi.waitFor(() => {
      expect(providersStore.getModelsForProvider('funasr-audio-transcription').map(model => model.id)).toEqual([
        'sensevoice',
        'fun-asr-nano',
        'paraformer',
      ])
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
      expect(useProviderConfigStore().getProviderConfig('funasr-audio-transcription')?.model).toBe('sensevoice')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3827031090
  // ROOT CAUSE:
  //
  // The OpenAI-compatible provider has no schema default or model list. The destination resolver
  // therefore cleared the shared model when the provider config had never stored a model.
  //
  // The existing OpenAI-compatible resolver owns the missing-model fallback to `whisper-1`.
  it('restores the OpenAI-compatible fallback after leaving FunASR (GitHub #2122)', async () => {
    const providerConfigStore = useProviderConfigStore()
    delete providerConfigStore.getProviderConfig('openai-compatible-audio-transcription')!.model
    const hearingStore = useHearingStore()

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider('openai-compatible-audio-transcription')

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('whisper-1')
      expect(providerConfigStore.getProviderConfig('openai-compatible-audio-transcription')?.model).toBe('whisper-1')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3679181238
  // ROOT CAUSE:
  //
  // Leaving FunASR cleared the shared Hearing model even when the destination provider exposed a
  // default model, so OpenAI requests used an empty model until the user reselected one manually.
  //
  // Before the patch, the provider transition always assigned an empty string.
  // We fixed this by resolving and persisting the destination provider's model during the transition.
  it('preserves the legacy OpenAI default after leaving FunASR (GitHub #2122)', async () => {
    const providerConfigStore = useProviderConfigStore()
    delete providerConfigStore.getProviderConfig('openai-audio-transcription')!.model
    const hearingStore = useHearingStore()

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider('openai-audio-transcription')

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('gpt-4o-transcribe')
      expect(providerConfigStore.getProviderConfig('openai-audio-transcription')?.model).toBe('gpt-4o-transcribe')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3679505099
  // ROOT CAUSE:
  //
  // The destination resolver trimmed an explicitly stored empty model and then treated the empty
  // result as if the provider had never stored a model, silently replacing it with a default.
  //
  // The destination provider owns the empty value, so switching providers must preserve it.
  it('preserves an explicitly cleared destination model after leaving FunASR (GitHub #2122)', async () => {
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()

    providerConfigStore.getProviderConfig('openai-audio-transcription')!.model = ''
    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider('openai-audio-transcription')

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('')
      expect(providerConfigStore.getProviderConfig('openai-audio-transcription')?.model).toBe('')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3679505102
  // ROOT CAUSE:
  //
  // Both the Hearing store transition watcher and the settings page loaded the destination models.
  // The two uncorrelated requests could resolve from different cache states and leave no active model.
  //
  // The provider-selection action owns one destination load.
  it('uses one model load after leaving FunASR (GitHub #2122)', async () => {
    const providersStore = useProviderStore()
    const hearingStore = useHearingStore()
    const fetchModelsForProvider = providersStore.fetchModelsForProvider.bind(providersStore)
    const fetchModels = vi.spyOn(providersStore, 'fetchModelsForProvider').mockImplementation(async (providerId) => {
      if (providerId !== 'browser-web-speech-api')
        return fetchModelsForProvider(providerId)

      return [
        {
          id: 'en-US',
          name: 'English (United States)',
          provider: 'browser-web-speech-api',
          description: '',
          contextLength: 0,
          deprecated: false,
        },
      ]
    })

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider('browser-web-speech-api')

    await vi.waitFor(() => {
      expect(fetchModels.mock.calls.filter(([providerId]) => providerId === 'browser-web-speech-api')).toHaveLength(1)
      expect(hearingStore.activeTranscriptionModel).toBe('en-US')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3710898890
  it('selects a list-backed fallback only from the fresh model response (GitHub #2122)', async () => {
    const providersStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()
    const providerId = 'browser-web-speech-api'
    const fetchModelsForProvider = providersStore.fetchModelsForProvider.bind(providersStore)

    providersStore.providerRuntimeState[providerId].models = [{
      id: 'stale-model',
      name: 'Stale model',
      provider: providerId,
    }]
    vi.spyOn(providersStore, 'fetchModelsForProvider').mockImplementation(async (requestedProviderId) => {
      if (requestedProviderId !== providerId)
        return fetchModelsForProvider(requestedProviderId)

      return [{
        id: 'fresh-model',
        name: 'Fresh model',
        provider: providerId,
        description: '',
        contextLength: 0,
        deprecated: false,
      }]
    })

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider(providerId)

    expect(hearingStore.activeTranscriptionModel).toBe('fresh-model')
    expect(providerConfigStore.getProviderConfig(providerId)?.model).toBe('fresh-model')
  })

  it('does not retain a stale fallback when the destination refresh fails (GitHub #2122)', async () => {
    const providersStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()
    const providerId = 'browser-web-speech-api'
    const fetchModelsForProvider = providersStore.fetchModelsForProvider.bind(providersStore)

    providersStore.providerRuntimeState[providerId].models = [{
      id: 'stale-model',
      name: 'Stale model',
      provider: providerId,
    }]
    vi.spyOn(providersStore, 'fetchModelsForProvider').mockImplementation(async (requestedProviderId) => {
      if (requestedProviderId !== providerId)
        return fetchModelsForProvider(requestedProviderId)

      return []
    })

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider(providerId)

    expect(hearingStore.activeTranscriptionModel).toBe('')
    expect(providerConfigStore.getProviderConfig(providerId)).not.toHaveProperty('model')
  })

  it('publishes a list-backed provider and its resolved model together (GitHub #2122)', async () => {
    const providersStore = useProviderStore()
    const hearingStore = useHearingStore()
    const providerId = 'browser-web-speech-api'
    const fetchModelsForProvider = providersStore.fetchModelsForProvider.bind(providersStore)
    type ListedModels = Awaited<ReturnType<typeof fetchModelsForProvider>>
    let resolveModels!: (models: ListedModels) => void
    const modelRequest = new Promise<ListedModels>((resolve) => {
      resolveModels = resolve
    })

    vi.spyOn(providersStore, 'fetchModelsForProvider').mockImplementation(async (requestedProviderId) => {
      if (requestedProviderId !== providerId)
        return fetchModelsForProvider(requestedProviderId)
      return modelRequest
    })

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    const selection = hearingStore.setActiveTranscriptionProvider(providerId)
    await vi.waitFor(() => expect(providersStore.fetchModelsForProvider).toHaveBeenCalledWith(providerId))

    expect(hearingStore.activeTranscriptionProvider).toBe('funasr-audio-transcription')
    expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')

    resolveModels([{
      id: 'fresh-model',
      name: 'Fresh model',
      provider: providerId,
      description: '',
      contextLength: 0,
      deprecated: false,
    }])
    await selection

    expect(hearingStore.activeTranscriptionProvider).toBe(providerId)
    expect(hearingStore.activeTranscriptionModel).toBe('fresh-model')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3757074253
  it('ignores an earlier model response after the same provider is selected again (GitHub #2122)', async () => {
    const providersStore = useProviderStore()
    const hearingStore = useHearingStore()
    const providerId = 'browser-web-speech-api'
    const fetchModelsForProvider = providersStore.fetchModelsForProvider.bind(providersStore)
    type ListedModels = Awaited<ReturnType<typeof fetchModelsForProvider>>
    let resolveFirstRequest!: (models: ListedModels) => void
    let resolveSecondRequest!: (models: ListedModels) => void
    const firstRequest = new Promise<ListedModels>((resolve) => {
      resolveFirstRequest = resolve
    })
    const secondRequest = new Promise<ListedModels>((resolve) => {
      resolveSecondRequest = resolve
    })
    let requestCount = 0

    vi.spyOn(providersStore, 'fetchModelsForProvider').mockImplementation(async (requestedProviderId) => {
      if (requestedProviderId !== providerId)
        return fetchModelsForProvider(requestedProviderId)

      requestCount++
      return requestCount === 1 ? firstRequest : secondRequest
    })

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    const firstLoad = hearingStore.setActiveTranscriptionProvider(providerId)
    await vi.waitFor(() => expect(requestCount).toBe(1))
    await hearingStore.setActiveTranscriptionProvider('openai-compatible-audio-transcription')
    const secondLoad = hearingStore.setActiveTranscriptionProvider(providerId)
    await vi.waitFor(() => expect(requestCount).toBe(2))

    resolveFirstRequest([{
      id: 'stale-model',
      name: 'Stale model',
      provider: providerId,
      description: '',
      contextLength: 0,
      deprecated: false,
    }])
    await firstLoad
    expect(hearingStore.activeTranscriptionProvider).toBe('openai-compatible-audio-transcription')
    expect(hearingStore.activeTranscriptionModel).toBe('whisper-1')

    resolveSecondRequest([{
      id: 'fresh-model',
      name: 'Fresh model',
      provider: providerId,
      description: '',
      contextLength: 0,
      deprecated: false,
    }])
    await secondLoad
    expect(hearingStore.activeTranscriptionModel).toBe('fresh-model')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3694431137
  it('resolves the destination model on every provider switch (GitHub #2122)', async () => {
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()

    providerConfigStore.getProviderConfig('mimo-audio-transcription')!.model = 'mimo-v2.5'
    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider('openai-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('gpt-4o-transcribe')
    })

    await hearingStore.setActiveTranscriptionProvider('mimo-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('mimo-v2.5')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3701729753
  it('preserves a model selected with an auth-owned provider transition (GitHub #2122)', async () => {
    const hearingStore = useHearingStore()

    await hearingStore.setActiveTranscriptionProvider('official-provider-transcription', 'auto')
    await nextTick()

    expect(hearingStore.activeTranscriptionModel).toBe('auto')
  })

  it('preserves a persisted model when Hearing starts with another provider', () => {
    persistedSettings.set('settings/hearing/active-provider', 'openai-compatible-audio-transcription')
    persistedSettings.set('settings/hearing/active-model', 'whisper-1')

    const hearingStore = useHearingStore()

    expect(hearingStore.activeTranscriptionModel).toBe('whisper-1')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3818977523
  it('does not mutate Hearing after a provider config snapshot', async () => {
    const providerId = 'openai-audio-transcription'
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()
    await hearingStore.setActiveTranscriptionProvider(providerId, 'leader-model')
    await nextTick()

    let hearingMutationCount = 0
    const stopSubscription = hearingStore.$subscribe(() => {
      hearingMutationCount++
    }, { flush: 'sync' })
    providerConfigStore.$patch((state) => {
      state.providers[providerId].config = {
        ...state.providers[providerId].config,
        model: 'follower-model',
      }
    })
    await nextTick()

    // ROOT CAUSE: A provider snapshot triggered a cross-store watcher that
    // proposed a second synchronized Hearing snapshot from the follower.
    expect(hearingMutationCount).toBe(0)
    expect(hearingStore.activeTranscriptionModel).toBe('leader-model')
    stopSubscription()
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3818977523
  it('does not mutate provider config after a Hearing snapshot', async () => {
    const providerId = 'openai-audio-transcription'
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()
    await hearingStore.setActiveTranscriptionProvider(providerId, 'leader-model')
    providerConfigStore.getProviderConfig(providerId)!.model = 'leader-model'
    await nextTick()

    let providerMutationCount = 0
    const stopSubscription = providerConfigStore.$subscribe(() => {
      providerMutationCount++
    }, { flush: 'sync' })
    hearingStore.$patch({ activeTranscriptionModel: 'follower-model' })
    await nextTick()

    // ROOT CAUSE: A Hearing snapshot triggered the reciprocal watcher and
    // proposed a second synchronized provider snapshot from the follower.
    expect(providerMutationCount).toBe(0)
    expect(providerConfigStore.getProviderConfig(providerId)?.model).toBe('leader-model')
    stopSubscription()
  })
})
