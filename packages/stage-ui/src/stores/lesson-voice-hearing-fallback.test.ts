import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ensureLessonHearingFallbackProvider,
  isLessonHearingFallbackSupported,
  LESSON_FALLBACK_HEARING_PROVIDER_ID,
} from './lesson-voice-hearing-fallback'
import { useHearingStore } from './modules/hearing'
import { useProvidersStore } from './providers'

vi.mock('@xsai/model', () => ({
  listModels: vi.fn(async () => []),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

function setRecognitionSupport(enabled: boolean) {
  vi.stubGlobal('window', enabled ? { webkitSpeechRecognition: class {} } : {})
}

describe('lesson voice hearing fallback', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('selects browser web speech api when no transcription provider is configured', async () => {
    setRecognitionSupport(true)

    const ready = await ensureLessonHearingFallbackProvider()
    const hearingStore = useHearingStore()
    const providersStore = useProvidersStore()

    expect(isLessonHearingFallbackSupported()).toBe(true)
    expect(ready).toBe(true)
    expect(hearingStore.activeTranscriptionProvider).toBe(LESSON_FALLBACK_HEARING_PROVIDER_ID)
    expect(hearingStore.activeTranscriptionModel).toBe('web-speech-api')
    expect(providersStore.providerRuntimeState[LESSON_FALLBACK_HEARING_PROVIDER_ID]?.isConfigured).toBe(true)
  })

  it('returns false when browser speech recognition is unavailable', async () => {
    setRecognitionSupport(false)

    const ready = await ensureLessonHearingFallbackProvider()
    const hearingStore = useHearingStore()

    expect(isLessonHearingFallbackSupported()).toBe(false)
    expect(ready).toBe(false)
    expect(hearingStore.activeTranscriptionProvider).toBe('')
  })

  it('does not override an existing non-fallback transcription provider', async () => {
    setRecognitionSupport(true)

    const hearingStore = useHearingStore()
    const providersStore = useProvidersStore()

    hearingStore.activeTranscriptionProvider = 'openai-compatible-audio-transcription'
    providersStore.providerRuntimeState['openai-compatible-audio-transcription'] = {
      isConfigured: false,
      validatedCredentialHash: '{}',
      models: [],
      isLoadingModels: false,
      modelLoadError: null,
    }

    const ready = await ensureLessonHearingFallbackProvider()

    expect(ready).toBe(false)
    expect(hearingStore.activeTranscriptionProvider).toBe('openai-compatible-audio-transcription')
  })
})
