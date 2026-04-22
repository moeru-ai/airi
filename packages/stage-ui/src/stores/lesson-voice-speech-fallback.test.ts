import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureLessonSpeechFallbackProvider, LESSON_FALLBACK_SPEECH_PROVIDER_ID } from './lesson-voice-speech-fallback'
import { useSpeechStore } from './modules/speech'
import { useProvidersStore } from './providers'

vi.mock('@xsai/model', () => ({
  listModels: vi.fn(async () => []),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

vi.mock('../workers/kokoro', () => ({
  getKokoroWorker: vi.fn(async () => ({
    loadModel: vi.fn(async () => {}),
    getVoices: vi.fn(() => ({
      af_bella: {
        language: 'en-us',
        name: 'Bella',
        gender: 'female',
      },
    })),
    generate: vi.fn(async () => new ArrayBuffer(8)),
  })),
}))

describe('lesson voice speech fallback', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('selects kokoro-local when no speech provider is configured', async () => {
    const ready = await ensureLessonSpeechFallbackProvider()
    const speechStore = useSpeechStore()
    const providersStore = useProvidersStore()

    expect(ready).toBe(true)
    expect(speechStore.activeSpeechProvider).toBe(LESSON_FALLBACK_SPEECH_PROVIDER_ID)
    expect(speechStore.activeSpeechModel).not.toBe('')
    expect(speechStore.activeSpeechVoiceId).toBe('af_bella')
    expect(providersStore.providerRuntimeState[LESSON_FALLBACK_SPEECH_PROVIDER_ID]?.isConfigured).toBe(true)
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('onMounted is called when there is no active component instance'),
    )
  })

  it('does not override an existing non-noop speech provider', async () => {
    const speechStore = useSpeechStore()
    const providersStore = useProvidersStore()

    speechStore.activeSpeechProvider = 'openai-compatible-audio-speech'
    providersStore.providerRuntimeState['openai-compatible-audio-speech'] = {
      isConfigured: false,
      validatedCredentialHash: '{}',
      models: [],
      isLoadingModels: false,
      modelLoadError: null,
    }

    const ready = await ensureLessonSpeechFallbackProvider()

    expect(ready).toBe(false)
    expect(speechStore.activeSpeechProvider).toBe('openai-compatible-audio-speech')
  })
})
