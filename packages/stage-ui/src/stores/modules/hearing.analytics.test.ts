import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const analyticsMock = vi.hoisted(() => ({
  allowComposableCall: true,
  trackAudioDeviceUnavailable: vi.fn(),
  trackMicrophonePermissionDenied: vi.fn(),
  trackSttFailed: vi.fn(),
  trackSttStarted: vi.fn(),
  trackSttSucceeded: vi.fn(),
  trackVoiceInputCancelled: vi.fn(),
  trackVoiceInputStarted: vi.fn(),
}))

const transcriptionMock = vi.hoisted(() => ({
  generateTranscription: vi.fn(async () => ({ text: 'hello' })),
}))

vi.mock('../../composables/use-analytics', () => ({
  useAnalytics: () => {
    if (!analyticsMock.allowComposableCall)
      throw new Error('Must be called at the top of a `setup` function')

    return {
      trackAudioDeviceUnavailable: analyticsMock.trackAudioDeviceUnavailable,
      trackMicrophonePermissionDenied: analyticsMock.trackMicrophonePermissionDenied,
      trackSttFailed: analyticsMock.trackSttFailed,
      trackSttStarted: analyticsMock.trackSttStarted,
      trackSttSucceeded: analyticsMock.trackSttSucceeded,
      trackVoiceInputCancelled: analyticsMock.trackVoiceInputCancelled,
      trackVoiceInputStarted: analyticsMock.trackVoiceInputStarted,
    }
  },
}))

vi.mock('@xsai/generate-transcription', () => ({
  generateTranscription: transcriptionMock.generateTranscription,
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
    analyticsMock.trackAudioDeviceUnavailable.mockReset()
    analyticsMock.trackMicrophonePermissionDenied.mockReset()
    analyticsMock.trackSttFailed.mockReset()
    analyticsMock.trackSttStarted.mockReset()
    analyticsMock.trackSttSucceeded.mockReset()
    analyticsMock.trackVoiceInputCancelled.mockReset()
    analyticsMock.trackVoiceInputStarted.mockReset()
    transcriptionMock.generateTranscription.mockReset()
    transcriptionMock.generateTranscription.mockResolvedValue({ text: 'hello' })
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
    expect(analyticsMock.trackVoiceInputStarted).toHaveBeenCalledWith({
      stt_provider_id: 'openai-compatible-audio-transcription',
    })
    expect(analyticsMock.trackSttStarted).toHaveBeenCalledWith('openai-compatible-audio-transcription')
    expect(analyticsMock.trackSttSucceeded).toHaveBeenCalledWith({
      provider: 'openai-compatible-audio-transcription',
      latency_ms: expect.any(Number),
      char_count: 5,
      stream: false,
    })
  }, 10000)

  /**
   * @example
   * await expect(hearingStore.transcription(providerId, provider, model, file)).rejects.toThrow()
   */
  it('normalizes microphone permission failures for analytics', async () => {
    const { useHearingStore } = await import('./hearing')
    const hearingStore = useHearingStore()
    const permissionError = new DOMException('User denied microphone', 'NotAllowedError')
    transcriptionMock.generateTranscription.mockRejectedValueOnce(permissionError)

    await expect(hearingStore.transcription(
      'openai-compatible-audio-transcription',
      {
        transcription: () => ({}),
      } as any,
      'FunAudioLLM/SenseVoiceSmall',
      new File(['hello'], 'recording.wav', { type: 'audio/wav' }),
    )).rejects.toBe(permissionError)

    expect(analyticsMock.trackSttFailed).toHaveBeenCalledWith({
      provider: 'openai-compatible-audio-transcription',
      error_code: 'permission_denied',
    })
    expect(analyticsMock.trackMicrophonePermissionDenied).toHaveBeenCalledWith({
      stt_provider_id: 'openai-compatible-audio-transcription',
      error_code: 'permission_denied',
    })
    expect(analyticsMock.trackAudioDeviceUnavailable).not.toHaveBeenCalled()
  }, 10000)
})
