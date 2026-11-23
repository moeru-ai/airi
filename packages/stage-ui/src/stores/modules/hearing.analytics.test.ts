import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const analyticsMock = vi.hoisted(() => ({
  allowComposableCall: true,
  trackMicrophonePermissionDenied: vi.fn(),
  trackSttFailed: vi.fn(),
  trackVoiceInputCancelled: vi.fn(),
}))

const transcriptionMock = vi.hoisted(() => ({
  generateTranscription: vi.fn(async () => ({ text: 'hello' })),
}))

vi.mock('../../composables/use-analytics', () => ({
  useAnalytics: () => {
    if (!analyticsMock.allowComposableCall)
      throw new Error('Must be called at the top of a `setup` function')

    return {
      trackMicrophonePermissionDenied: analyticsMock.trackMicrophonePermissionDenied,
      trackSttFailed: analyticsMock.trackSttFailed,
      trackVoiceInputCancelled: analyticsMock.trackVoiceInputCancelled,
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
    analyticsMock.trackMicrophonePermissionDenied.mockReset()
    analyticsMock.trackSttFailed.mockReset()
    analyticsMock.trackVoiceInputCancelled.mockReset()
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
    // A successful transcription is counted by its message round, so it sends no event of its own.
    expect(analyticsMock.trackSttFailed).not.toHaveBeenCalled()
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
  }, 10000)
})

describe('useHearingStore empty response log', () => {
  /**
   * @example
   * await hearingStore.transcription(providerId, provider, model, file)
   */
  it('logs the response shape without the provider address if a response has no text', async () => {
    setActivePinia(createPinia())
    analyticsMock.allowComposableCall = true
    transcriptionMock.generateTranscription.mockReset()
    transcriptionMock.generateTranscription.mockResolvedValueOnce({ text: '', task: 'transcribe' } as { text: string })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { useHearingStore } = await import('./hearing')
    const hearingStore = useHearingStore()

    await hearingStore.transcription(
      'openai-compatible-audio-transcription',
      { transcription: (model: string) => ({ apiKey: 'test-key', baseURL: 'https://example.com/v1/', model }) },
      'whisper-1',
      new File(['hello'], 'recording.wav', { type: 'audio/wav' }),
      undefined,
      { confidenceThreshold: -3 },
    )

    const message = warn.mock.calls.flat().join(' ')
    expect(message).toContain('[Hearing] Transcription response has no text.')
    expect(message).toContain('requestedFormat=default')
    expect(message).toContain('keys=text,task')
    expect(message).toContain('segments=absent')
    expect(message).not.toContain('example.com')
    expect(message).not.toContain('test-key')
    warn.mockRestore()
  })
})
