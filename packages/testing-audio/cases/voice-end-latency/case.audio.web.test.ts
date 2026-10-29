import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared/perf/io-trace'

import { describe, expect, it } from '../../src'
import { configureModuleConsciousness, configureModuleHearing, configureOnboarding, loadCaseEnvironment } from '../shared/configurations'
import { waitForVoiceDraft } from '../shared/interactions'
import { aliyunNlsAsr, openaiLlm } from '../shared/providers'

/**
 * The end judge pause and the voice activity silence limit with the end judge on: a 1.2 s pause and a 3 s grace period.
 * The same values are in `VOICE_END_SILENCE` of packages/stage-ui/src/stores/voice.ts.
 */
const PAUSE_MS = 1200
const SILENCE_LIMIT_MS = 4200

function millis(nano: string) {
  return Number(BigInt(nano) / 1_000_000n)
}

describe('voice end latency', () => {
  // The fixture is the single-utterance-pipeline recording with 8 s of trailing silence, so the silence limit
  // cannot end the input first. Streaming ASR gives text during the pause, which the end judge and the rewrite need.
  it('ends a finished message by judgement and reuses the speculative rewrite', {
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
          'Set all TESTING_AUDIO_ASR_ALIYUN_NLS_* variables to run this case.',
        )
        if (!provider || !accessKeyId || !accessKeySecret || !appKey)
          return undefined

        // The always-on input mode listens as soon as the microphone setting is on, so the case needs no UI step.
        return { provider: aliyunNlsAsr({ provider, accessKeyId, accessKeySecret, appKey }), captureFormat: 'pcm', microphoneEnabled: true }
      }),
      // The end judge and the rewrite use the chat model when no rephrase Provider is set.
      configureModuleConsciousness(async (context) => {
        const environment = await loadCaseEnvironment(context.env)
        const apiKey = environment.TESTING_AUDIO_LLM_API_KEY
        context.skip(!apiKey, 'Set TESTING_AUDIO_LLM_API_KEY to run this case.')
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
    ],
  }, async ({ audio, annotate }) => {
    await audio.waitForVoiceInput({ timeout: 60_000 })
    await waitForVoiceDraft(audio, { timeout: 60_000 })

    const [voiceInput] = await audio.completedSpans(IOSpanNames.VoiceInput)
    expect(voiceInput).toBeDefined()
    const ofInput = (spans: SerializedIOSpan[]) => spans.filter(span => span.traceId === voiceInput!.traceId)
    const speech = ofInput(await audio.completedSpans(IOSpanNames.VoiceActivityDetection))
    const [recognition] = ofInput(await audio.completedSpans(IOSpanNames.SpeechRecognition))
    const judgements = ofInput(await audio.completedSpans(IOSpanNames.EndOfSpeechJudgement))
    const rewrites = ofInput(await audio.completedSpans(IOSpanNames.TranscriptRephrase))
    expect(speech.length).toBeGreaterThan(0)
    expect(recognition).toBeDefined()

    const lastSpeechEnd = Math.max(...speech.map(span => millis(span.endTimeNano)))
    const recognitionEnd = millis(recognition!.endTimeNano)
    const submitted = millis(voiceInput!.endTimeNano)
    const timeline = {
      transcript: (await audio.transcriptionResults(1)).at(-1),
      endOfSpeechToRecognitionEndMs: recognitionEnd - lastSpeechEnd,
      recognitionEndToSubmissionMs: submitted - recognitionEnd,
      judgements: judgements.map(span => ({
        startMs: millis(span.startTimeNano) - lastSpeechEnd,
        endMs: millis(span.endTimeNano) - lastSpeechEnd,
        judgement: span.attributes[IOAttributes.EndJudgement],
        cancelled: span.attributes[IOAttributes.Cancelled] ?? false,
      })),
      rewrites: rewrites.map(span => ({
        startMs: millis(span.startTimeNano) - lastSpeechEnd,
        endMs: millis(span.endTimeNano) - lastSpeechEnd,
      })),
    }
    await annotate('voice-end-latency.json', { body: `${JSON.stringify(timeline, null, 2)}\n`, bodyEncoding: 'utf-8', contentType: 'application/json' })

    const details = JSON.stringify(timeline)
    // The judgement starts after the pause and survives provider revisions that keep the text.
    const [judgement] = timeline.judgements
    expect(judgement, details).toBeDefined()
    expect(judgement!.startMs, details).toBeGreaterThanOrEqual(PAUSE_MS - 100)
    expect(judgement!.cancelled, details).toBe(false)
    // The model decides the answer, and it can read this request as unfinished. Only a complete answer ends the input early.
    if (judgement!.judgement === 'complete')
      expect(timeline.endOfSpeechToRecognitionEndMs, details).toBeLessThan(SILENCE_LIMIT_MS)
    // The rewrite started during the pause, before the provider finished, so submission did not wait for a new request.
    expect(rewrites.some(span => millis(span.startTimeNano) < recognitionEnd), details).toBe(true)
  })
})
