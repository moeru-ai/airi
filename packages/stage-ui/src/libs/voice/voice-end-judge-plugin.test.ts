import type { TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { EndJudgement } from './voice-end-judge-plugin'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { describe, expect, it, vi } from 'vitest'

import { createVoiceEndJudgePlugin } from './voice-end-judge-plugin'

/** 1 kHz keeps frame numbers equal to milliseconds. */
const SAMPLE_RATE = 1000

function createHarness(judge: (transcript: string, context: unknown, signal: AbortSignal) => Promise<EndJudgement>, enabled = true, pauseMs: number | (() => number) = 1200) {
  const source = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => source.stream })
  const output = createPushStream<TranscriptionEvent>()
  const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft' }))
  const controller = new VoiceController({ audio, submit, transcriber: () => ({ transcribe: () => output.stream }) })
  controller.use(createVoiceEndJudgePlugin({ enabled: () => enabled, judge, pauseMs }), { grants: ['input-control'] })
  const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
  let frame = 0
  let revision = 0

  /** Writes 100 ms of audio and notes VAD evidence for it, as the voice activity plugin does for each window. */
  async function hear(speech: boolean) {
    const range = { sourceId: 'mic', startFrame: frame, endFrame: frame + 100 }
    source.write({ range, sampleRate: SAMPLE_RATE, channels: [new Float32Array(100)] })
    frame += 100
    await expect.poll(() => audio.position?.frame).toBe(range.endFrame)
    attempt.noteActivity({ range, speech })
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

  it('reads the pause limit on each window', async () => {
    const judge = vi.fn(async () => 'complete' as const)
    let pauseMs = 1200
    const harness = createHarness(judge, true, () => pauseMs)
    await harness.start()

    await harness.speak('what time is it')
    await harness.pause(500)
    expect(judge).not.toHaveBeenCalled()
    pauseMs = 300
    await harness.pause(200)

    await expect.poll(() => harness.attempt.state.phase).not.toBe('capturing')
    expect(judge).toHaveBeenCalledOnce()
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
