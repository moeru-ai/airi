import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const analyticsMock = vi.hoisted(() => ({
  allowComposableCall: true,
  trackSttFailed: vi.fn(),
  trackSttStarted: vi.fn(),
  trackSttSucceeded: vi.fn(),
}))

vi.mock('../../composables/use-analytics', () => ({
  useAnalytics: () => {
    if (!analyticsMock.allowComposableCall)
      throw new Error('Must be called at the top of a `setup` function')

    return {
      trackSttFailed: analyticsMock.trackSttFailed,
      trackSttStarted: analyticsMock.trackSttStarted,
      trackSttSucceeded: analyticsMock.trackSttSucceeded,
    }
  },
}))

vi.mock('@xsai/generate-transcription', () => ({
  generateTranscription: vi.fn(async () => ({ text: 'hello' })),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('useHearingStore analytics lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    analyticsMock.allowComposableCall = true
    analyticsMock.trackSttFailed.mockReset()
    analyticsMock.trackSttStarted.mockReset()
    analyticsMock.trackSttSucceeded.mockReset()
  })

  /**
   * @example
   * await hearingStore.transcription(providerId, provider, model, file)
   */
  it('does not call analytics composables when a recording is transcribed later', async () => {
    const { useHearingStore } = await import('./hearing')
    const hearingStore = useHearingStore()
    analyticsMock.allowComposableCall = false

    const result = await hearingStore.transcription(
      'openai-compatible-audio-transcription',
      {
        transcription: () => ({}),
      } as any,
      'FunAudioLLM/SenseVoiceSmall',
      new File(['hello'], 'recording.wav', { type: 'audio/wav' }),
    )

    expect(result.text).toBe('hello')
    expect(analyticsMock.trackSttStarted).toHaveBeenCalledWith('openai-compatible-audio-transcription')
    expect(analyticsMock.trackSttSucceeded).toHaveBeenCalledWith({
      provider: 'openai-compatible-audio-transcription',
      latency_ms: expect.any(Number),
      char_count: 5,
      stream: false,
    })
  }, 10000)
})
