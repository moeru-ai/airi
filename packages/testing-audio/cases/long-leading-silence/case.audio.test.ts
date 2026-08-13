import { describe, expect, it } from '../../src'
import { configureModuleHearing, configureOnboarding, loadCaseEnvironment } from '../shared/configurations'
import { enableChatMicrophone } from '../shared/interactions'
import { aliyunNlsAsr, openaiAsr } from '../shared/providers'

describe('audio input pipeline', () => {
  // The fixture uses the repository recording at docs/content/en/blog/DevLog-2025.03.20/assets/ashley-pitch-test.mp3.
  // It has 20 seconds of leading silence and 4 seconds of trailing silence in mono 16 kHz PCM WAV format.
  it('does not preserve the complete phrase after long leading silence', {
    input: new URL('./input.test.wav', import.meta.url),
    // This regression isolates AIRI's default VAD and one explicit ASR Provider.
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
    ],
  }, async ({ audio }) => {
    await enableChatMicrophone(audio)

    if (audio.transcriptionCaptureFormat) {
      await expect(audio).toHaveCapturedTranscriptionAudio({
        count: 1,
        minimumBytes: 8000,
      })
    }

    // The VAD upload currently drops part of the sentence before it sends the recording to ASR.
    await expect(audio).not.toHaveTranscriptions([
      ['There is no meaning to your existence, just let go.'],
    ])
  })

  it('does not preserve the complete phrase with Aliyun NLS', {
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
    await expect(audio).not.toHaveTranscriptions([
      ['There is no meaning to your existence, just let go.'],
    ])
  })
})
