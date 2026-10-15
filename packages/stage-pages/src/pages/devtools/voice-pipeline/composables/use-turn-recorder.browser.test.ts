import type { SpeechSubmission, TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { PHONETIC_SUGGESTIONS_KEY } from '@proj-airi/stage-ui/libs/voice/voice-phonetic-match-plugin'
import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { suggestionsOf, useTurnRecorder } from './use-turn-recorder'

const fake = vi.hoisted(() => ({ store: undefined as unknown }))
vi.mock('@proj-airi/stage-ui/stores/voice', () => ({ useVoiceStore: () => fake.store }))

/** A voice store with a real controller. Its transcriber streams two revisions, and its submit commits the input. */
function createVoice() {
  const frames = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => frames.stream })
  const observers = new Set<(submission: SpeechSubmission) => void>()
  const controller = new VoiceController({
    audio,
    transcriber: () => ({ transcribe: request => new ReadableStream<TranscriptionEvent>({ async start(output) {
      output.enqueue({ type: 'update', revision: 1, segments: [{ id: 'speech-0', revision: 1, text: 'hello', tokens: [], final: false }] })
      for await (const _block of request.audio) { /* the input ends the audio */ }
      output.enqueue({ type: 'update', revision: 2, segments: [{ id: 'speech-0', revision: 2, text: 'hello world', tokens: [], final: true }] })
      output.enqueue({ type: 'complete', revision: 2 })
      output.close()
    } }) }),
    submit: async (submission) => {
      observers.forEach(observe => observe(submission))
      return { status: 'committed', messageId: submission.submissionId }
    },
  })
  // Publishes a suggestion, as the phonetic match plugin does, so the submission carries context.
  controller.use({ name: 'voice-phonetic-match', setup(scope) {
    scope.onSpeechInput((input) => {
      input.subscribe({ transcript: 'raw', scheduling: 'latest', waitForSubmissionMs: 1000 }, async (ctx) => {
        if (ctx.snapshot.transcript.segments.every(segment => segment.final))
          ctx.context.set(PHONETIC_SUGGESTIONS_KEY, { note: 'test', items: [{ span: 'world', candidate: 'World', term: 'World', score: 0.9, source: 'test', description: 'A term.' }] })
      })
      return undefined
    })
    return undefined
  } })
  fake.store = {
    controller,
    observeSubmissions: (observe: (submission: SpeechSubmission) => void) => {
      observers.add(observe)
      return () => void observers.delete(observe)
    },
  }
  return { controller, frames }
}

describe('useTurnRecorder', () => {
  it('records the revisions, the submission, the chat turn, and the speech context of an input', async () => {
    const { controller, frames } = createVoice()
    const scope = effectScope()
    const recorder = scope.run(() => useTurnRecorder())!

    const attempt = controller.beginInput({ sessionId: 'session-1', interruptTurns: [], start: { kind: 'after-silence' } })
    frames.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 16 }, sampleRate: 16000, channels: [new Float32Array(16)] })
    await expect.poll(() => recorder.records.get(attempt.id)?.partials.length).toBe(1)
    await attempt.end()
    expect(await attempt.done).toEqual({ status: 'committed', messageId: attempt.id })

    const record = recorder.records.get(attempt.id)!
    expect(record.partials.map(partial => partial.text)).toEqual(['hello', 'hello world'])
    expect(record.submission?.text).toBe('hello world')
    expect(record.turnId).toBe(attempt.id)
    expect(suggestionsOf(record.submission).map(item => item.candidate)).toEqual(['World'])
    expect(JSON.parse(recorder.speechContextOf(attempt.id)!)).toEqual([{ context: [expect.objectContaining({ key: PHONETIC_SUGGESTIONS_KEY })] }])

    scope.stop()
    await controller.close()
  })
})
