import { describe, expect, it } from '../../src'
import { configureModuleHearing, configureOnboarding, loadCaseEnvironment } from '../shared/configurations'
import { enableChatMicrophone } from '../shared/interactions'
import { aliyunNlsAsr, openaiAsr } from '../shared/providers'

describe('audio input pipeline', () => {
  // The fixture has 12 seconds of leading silence so that the browser VAD can load.
  // It repeats the greeting after a 2-second pause to catch regressions that drop the second utterance.
  it('keeps two utterances in streaming transcription', {
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

    const expectedTranscriptions = [
      [
        'Microphone warm up, microphone warm up. Hello, AIRI, please say hello.',
        'Microphone warm up, microphone warm up. Hello, Eric, please say hello.',
      ],
      [
        'Microphone warm up, microphone warm up. Hello, AIRI, please say hello.',
        'Microphone warm up, microphone warm up. Hello, Eric, please say hello.',
      ],
    ]
    await expect(audio).toHaveTranscriptions(expectedTranscriptions)

    const finalTranscriptions = await audio.transcriptionResults(expectedTranscriptions.length)
    const streamingUpdates = await audio.streamingTranscriptionUpdates()
    expect(streamingUpdates.some(update => !finalTranscriptions.includes(update))).toBe(true)
    await expect(audio).toHaveCompletedTranscription()
  })

  it('keeps two Aliyun NLS utterances in streaming transcription', {
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
    const expectedTranscriptions = [
      [
        'Microphone warm up, microphone warm up. Hello, AIRI, please say hello.',
        'Microphone warm up, microphone warm up. Hello, Eric, please say hello.',
      ],
      [
        'Microphone warm up, microphone warm up. Hello, AIRI, please say hello.',
        'Microphone warm up, microphone warm up. Hello, Eric, please say hello.',
      ],
    ]
    await expect(audio).toHaveTranscriptions(expectedTranscriptions)

    const finalTranscriptions = await audio.transcriptionResults(expectedTranscriptions.length)
    const streamingUpdates = await audio.streamingTranscriptionUpdates()
    expect(streamingUpdates.some(update => !finalTranscriptions.includes(update))).toBe(true)
    await expect(audio).toHaveCompletedTranscription()
  })
})
