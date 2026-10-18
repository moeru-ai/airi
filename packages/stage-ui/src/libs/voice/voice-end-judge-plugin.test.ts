import type { EndJudgement } from '@proj-airi/agents/voice-end-judge'
import type { TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { inputActivitySignal, VoiceController } from '@proj-airi/core-agent'
import { AudioInput } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { describe, expect, it, vi } from 'vitest'

import { createVoiceEndJudgePlugin } from './voice-end-judge-plugin'

/** 1 kHz keeps frame numbers equal to milliseconds. */
const SAMPLE_RATE = 1000

function createHarness(judge: (transcript: string, context: unknown, signal: AbortSignal) => Promise<EndJudgement>, enabled = true) {
  const source = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => source.stream })
  const output = createPushStream<TranscriptionEvent>()
  const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft' }))
  const controller = new VoiceController({ audio, submit, transcriber: () => ({ transcribe: () => output.stream }) })
  controller.use(createVoiceEndJudgePlugin({ enabled: () => enabled, judge, pauseMs: 1200 }), { grants: ['input-control'] })
  // Stands in for the speech activity rule, which emits one activity signal for each window of its input.
  let emitActivity: ((body: { inputId: string, range: { sourceId: string, startFrame: number, endFrame: number }, speech: boolean, durationMs: number }) => void) | undefined
  controller.use({ name: 'test-activity', setup(scope) {
    emitActivity = body => scope.emit(inputActivitySignal, body)
    return undefined
  } })
  const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
  let frame = 0
  let revision = 0

  /** Writes 100 ms of audio and emits its activity, as the speech activity rule does for each window. */
  async function hear(speech: boolean) {
    const range = { sourceId: 'mic', startFrame: frame, endFrame: frame + 100 }
    source.write({ range, sampleRate: SAMPLE_RATE, channels: [new Float32Array(100)] })
    frame += 100
    // A seal command runs after the engine queue drains, so the input can end and release the microphone here.
    await expect.poll(() => audio.position?.frame === range.endFrame || attempt.state.phase !== 'capturing').toBe(true)
    if (attempt.state.phase === 'capturing')
      emitActivity!({ inputId: attempt.id, range, speech, durationMs: 100 })
  }

  return {
    controller,
    attempt,
    async start() {
      await hear(false)
      await expect.poll(() => attempt.state.phase).toBe('capturing')
    },
    async speak(text: string) {
      await hear(true)
      revision += 1
      output.write({ type: 'update', revision, segments: [{ id: 'speech-0', revision, text, tokens: [], final: false }] })
    },
    /** Stops early when the input ends, because an ended input releases the microphone. */
    async pause(ms: number) {
      for (let elapsed = 0; elapsed < ms && attempt.state.phase === 'capturing'; elapsed += 100)
        await hear(false)
    },
  }
}

describe('createVoiceEndJudgePlugin', () => {
  it('ends a paused input when the model reads a complete message', async () => {
    const judge = vi.fn(async () => 'complete' as const)
    const harness = createHarness(judge)
    await harness.start()

    await harness.speak('what time is it')
    await harness.pause(1500)

    await expect.poll(() => harness.attempt.state.phase).not.toBe('capturing')
    expect(judge).toHaveBeenCalledOnce()
    expect(judge).toHaveBeenCalledWith('what time is it', { revision: 0, messages: [] }, expect.any(AbortSignal))
    await harness.controller.close()
  })

  it('keeps an unfinished message open and judges each transcript once', async () => {
    const judge = vi.fn(async () => 'incomplete' as const)
    const harness = createHarness(judge)
    await harness.start()

    await harness.speak('hey iru, can you')
    await harness.pause(2500)

    expect(harness.attempt.state.phase).toBe('capturing')
    expect(judge).toHaveBeenCalledOnce()
    await harness.controller.close()
  })

  it('does not judge a pause shorter than the pause limit, or silence before the first speech', async () => {
    const judge = vi.fn(async () => 'complete' as const)
    const harness = createHarness(judge)
    await harness.start()

    await harness.pause(2000)
    await harness.speak('what time')
    await harness.pause(800)

    expect(judge).not.toHaveBeenCalled()
    expect(harness.attempt.state.phase).toBe('capturing')
    await harness.controller.close()
  })

  it('aborts a judgement when the speaker continues, and judges the new transcript', async () => {
    const signals: AbortSignal[] = []
    const first = Promise.withResolvers<EndJudgement>()
    const judge = vi.fn(async (_transcript: string, _context: unknown, signal: AbortSignal) => {
      signals.push(signal)
      return signals.length === 1 ? first.promise : 'complete'
    })
    const harness = createHarness(judge)
    await harness.start()

    await harness.speak('remind me to')
    await harness.pause(1300)
    await vi.waitFor(() => expect(judge).toHaveBeenCalledOnce())
    await harness.speak('remind me to buy milk')
    await harness.pause(1300)
    first.resolve('complete')
    await harness.pause(300)

    await expect.poll(() => harness.attempt.state.phase).not.toBe('capturing')
    expect(signals[0]!.aborted).toBe(true)
    expect(judge).toHaveBeenLastCalledWith('remind me to buy milk', expect.anything(), expect.any(AbortSignal))
    await harness.controller.close()
  })

  it('keeps the input open when the model fails', async () => {
    const judge = vi.fn(async () => {
      throw new Error('model unavailable')
    })
    const harness = createHarness(judge)
    await harness.start()

    await harness.speak('what time is it')
    await harness.pause(1500)

    await vi.waitFor(() => expect(judge).toHaveBeenCalledOnce())
    expect(harness.attempt.state.phase).toBe('capturing')
    await harness.controller.close()
  })

  it('does not judge when it is disabled', async () => {
    const judge = vi.fn(async () => 'complete' as const)
    const harness = createHarness(judge, false)
    await harness.start()

    await harness.speak('what time is it')
    await harness.pause(1500)

    expect(judge).not.toHaveBeenCalled()
    expect(harness.attempt.state.phase).toBe('capturing')
    await harness.controller.close()
  })
})
