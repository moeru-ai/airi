import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useProvidersStore } from '../providers'
import { useHearingStore } from './hearing'

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
  })

  it('hydrates FunASR models when Hearing starts with the provider persisted', async () => {
    persistedSettings.set('settings/hearing/active-provider', 'funasr-audio-transcription')

    const providersStore = useProvidersStore()
    const hearingStore = useHearingStore()

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

    const providersStore = useProvidersStore()
    providersStore.providers['funasr-audio-transcription'].model = ''
    const hearingStore = useHearingStore()

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('')
      expect(providersStore.getProviderConfig('funasr-audio-transcription')?.model).toBe('')
    })
  })

  it('restores the FunASR configured model when the provider is selected', async () => {
    const providersStore = useProvidersStore()
    const hearingStore = useHearingStore()

    providersStore.providers['funasr-audio-transcription'].model = 'paraformer'
    hearingStore.activeTranscriptionProvider = 'funasr-audio-transcription'

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('paraformer')
    })
  })

  it('persists the active Hearing model into the FunASR provider config', async () => {
    const providersStore = useProvidersStore()
    const hearingStore = useHearingStore()

    hearingStore.activeTranscriptionProvider = 'funasr-audio-transcription'
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    hearingStore.activeTranscriptionModel = 'fun-asr-nano'

    await vi.waitFor(() => {
      expect(providersStore.getProviderConfig('funasr-audio-transcription')?.model).toBe('fun-asr-nano')
    })
  })

  it('clears the FunASR model when another provider is selected', async () => {
    const hearingStore = useHearingStore()

    hearingStore.activeTranscriptionProvider = 'funasr-audio-transcription'
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    hearingStore.activeTranscriptionProvider = 'openai-compatible-audio-transcription'

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
  it('selects the OpenAI displayed default after leaving FunASR (GitHub #2122)', async () => {
    const providersStore = useProvidersStore()
    const hearingStore = useHearingStore()

    hearingStore.activeTranscriptionProvider = 'funasr-audio-transcription'
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    hearingStore.activeTranscriptionProvider = 'openai-audio-transcription'

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('whisper-1')
      expect(providersStore.getProviderConfig('openai-audio-transcription')?.model).toBe('whisper-1')
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
    const providersStore = useProvidersStore()
    const hearingStore = useHearingStore()

    providersStore.providers['openai-audio-transcription'].model = ''
    hearingStore.activeTranscriptionProvider = 'funasr-audio-transcription'
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    hearingStore.activeTranscriptionProvider = 'openai-audio-transcription'

    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('')
      expect(providersStore.getProviderConfig('openai-audio-transcription')?.model).toBe('')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3679505102
  // ROOT CAUSE:
  //
  // Both the Hearing store transition watcher and the settings page loaded the destination models.
  // The two uncorrelated requests could resolve from different cache states and leave no active model.
  //
  // The settings page owns the destination load; the store consumes that single result.
  it('reuses the settings page model load after leaving FunASR (GitHub #2122)', async () => {
    const providersStore = useProvidersStore()
    const hearingStore = useHearingStore()
    const browserProvider = providersStore.findProviderMetadata('browser-web-speech-api')
    const listModels = vi.spyOn(browserProvider!.capabilities, 'listModels').mockResolvedValue([
      {
        id: 'en-US',
        name: 'English (United States)',
        provider: 'browser-web-speech-api',
      },
    ])

    hearingStore.activeTranscriptionProvider = 'funasr-audio-transcription'
    await vi.waitFor(() => {
      expect(hearingStore.activeTranscriptionModel).toBe('sensevoice')
    })

    hearingStore.activeTranscriptionProvider = 'browser-web-speech-api'
    await hearingStore.loadModelsForProvider('browser-web-speech-api')

    await vi.waitFor(() => {
      expect(listModels).toHaveBeenCalledTimes(1)
      expect(hearingStore.activeTranscriptionModel).toBe('en-US')
    })
  })

  it('preserves a persisted model when Hearing starts with another provider', () => {
    persistedSettings.set('settings/hearing/active-provider', 'openai-compatible-audio-transcription')
    persistedSettings.set('settings/hearing/active-model', 'whisper-1')

    const hearingStore = useHearingStore()

    expect(hearingStore.activeTranscriptionModel).toBe('whisper-1')
  })
})
