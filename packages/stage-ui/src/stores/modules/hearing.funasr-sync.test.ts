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
  beforeEach(() => {
    persistedSettings.clear()
    setActivePinia(createPinia())

    const providersStore = useProviderStore()
    for (const providerId of TRANSCRIPTION_PROVIDER_IDS)
      providersStore.initializeProvider(providerId)
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

  it('restores the FunASR configured model when the provider is selected', async () => {
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()

    providerConfigStore.getProviderConfig('funasr-audio-transcription')!.model = 'paraformer'
    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('paraformer')
    })
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
        resolveInitialization = () => {
          initializeProvider(providerId)
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

  it('clears the FunASR model when another provider is selected', async () => {
    const hearingStore = useHearingStore()

    await hearingStore.setActiveTranscriptionProvider('funasr-audio-transcription')
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    await hearingStore.setActiveTranscriptionProvider('openai-compatible-audio-transcription')

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('')
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
    expect(hearingStore.activeTranscriptionModel).toBe('')

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
