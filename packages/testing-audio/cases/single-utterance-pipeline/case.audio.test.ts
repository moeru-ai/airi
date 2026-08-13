import { describe, expect, it } from '../../src'
import { configureModuleConsciousness, configureModuleHearing, configureModuleSpeech, configureOnboarding, loadCaseEnvironment } from '../shared/configurations'
import { assistantMessages, enableChatMicrophone, openChat } from '../shared/interactions'
import { aliyunNlsAsr, openaiAsr, openaiLlm, openaiTts } from '../shared/providers'

describe('audio input pipeline', () => {
  // An OpenAI-compatible TTS Provider generated the fixture in mono 16 kHz PCM WAV format.
  // The fixture contains 14 seconds of leading silence for VAD initialization and 3 seconds of trailing silence.
  // Its warm-up phrase gives the VAD time to start. Only "Please say hello." is required in the transcript.
  it('runs an OpenAI-compatible request through the complete pipeline', {
    input: new URL('./input.test.wav', import.meta.url),
    // This case keeps AIRI's default VAD and selects every remote Provider explicitly.
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureModuleHearing(async (context) => {
        const environment = await loadCaseEnvironment(context.env)
        const apiKey = environment.TESTING_AUDIO_ASR_API_KEY
        context.skip(!apiKey, 'Set TESTING_AUDIO_ASR_API_KEY to run this ASR case.')
        if (!apiKey)
          return undefined

        return {
          provider: openaiAsr({
            apiKey,
            baseUrl: environment.TESTING_AUDIO_ASR_API_BASE_URL ?? 'https://api.openai.com/v1/',
            model: environment.TESTING_AUDIO_ASR_MODEL ?? 'whisper-1',
            provider: environment.TESTING_AUDIO_ASR_PROVIDER ?? 'openai-compatible-audio-transcription',
          }),
          captureFormat: 'wav',
        }
      }),
      configureModuleConsciousness(async (context) => {
        const environment = await loadCaseEnvironment(context.env)
        const apiKey = environment.TESTING_AUDIO_LLM_API_KEY
        context.skip(!apiKey, 'Set TESTING_AUDIO_LLM_API_KEY to run this LLM case.')
        if (!apiKey)
          return undefined

        return {
          provider: openaiLlm({
            apiKey,
            baseUrl: environment.TESTING_AUDIO_LLM_API_BASE_URL ?? 'https://api.openai.com/v1/',
            model: environment.TESTING_AUDIO_LLM_MODEL ?? 'gpt-4o-mini',
            provider: environment.TESTING_AUDIO_LLM_PROVIDER ?? 'openai-compatible',
          }),
        }
      }),
      configureModuleSpeech(async (context) => {
        const environment = await loadCaseEnvironment(context.env)
        const apiKey = environment.TESTING_AUDIO_TTS_API_KEY
        context.skip(!apiKey, 'Set TESTING_AUDIO_TTS_API_KEY to run this TTS case.')
        if (!apiKey)
          return undefined

        return openaiTts({
          apiKey,
          baseUrl: environment.TESTING_AUDIO_TTS_API_BASE_URL ?? 'https://api.openai.com/v1/',
          model: environment.TESTING_AUDIO_TTS_MODEL ?? 'tts-1',
          provider: environment.TESTING_AUDIO_TTS_PROVIDER ?? 'openai-compatible-audio-speech',
          voice: environment.TESTING_AUDIO_TTS_VOICE ?? 'alloy',
        })
      }),
    ],
  }, async ({ audio }) => {
    await enableChatMicrophone(audio)

    if (audio.transcriptionCaptureFormat) {
      await expect(audio).toHaveCapturedTranscriptionAudio({
        count: 1,
        minimumBytes: 8000,
      })
    }

    await expect(audio).toHaveTranscriptions([
      ['Please say hello.'],
    ], { match: 'contains' })

    await expect.poll(async () => (await audio.completedSpans('LLM inference')).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1)
    await expect.poll(async () => (await audio.completedSpans('TTS synthesis')).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1)
    await expect.poll(async () => (await audio.completedSpans('Audio playback')).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1)

    await openChat(audio)
    const messages = await assistantMessages(audio).allTextContents()
    expect(messages.at(-1)).toMatch(/.+/s)
  })

  it('transcribes the greeting with Aliyun NLS', {
    input: new URL('./input.test.wav', import.meta.url),
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureModuleHearing(async (context) => {
        const environment = await loadCaseEnvironment(context.env)
        const provider = environment.TESTING_AUDIO_ASR_ALIYUN_NLS_PROVIDER
        const accessKeyId = environment.TESTING_AUDIO_ASR_ALIYUN_NLS_ALIYUN_AK_ID
        const accessKeySecret = environment.TESTING_AUDIO_ASR_ALIYUN_NLS_ALIYUN_AK_SECRET
        const appKey = environment.TESTING_AUDIO_ASR_ALIYUN_NLS_APPKEY
        context.skip(
          !provider || !accessKeyId || !accessKeySecret || !appKey,
          'Set all TESTING_AUDIO_ASR_ALIYUN_NLS_* variables to run this ASR case.',
        )
        if (!provider || !accessKeyId || !accessKeySecret || !appKey)
          return undefined

        return {
          provider: aliyunNlsAsr({ provider, accessKeyId, accessKeySecret, appKey }),
          captureFormat: 'pcm',
        }
      }),
    ],
  }, async ({ audio }) => {
    await enableChatMicrophone(audio, { readiness: 'streaming-transcription' })

    await expect(audio).toHaveCapturedTranscriptionAudio({
      count: 1,
      minimumBytes: 8000,
    })
    await expect(audio).toHaveTranscriptions([
      ['Please say hello.'],
    ], { match: 'contains' })
  })
})
