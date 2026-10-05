import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { TranscriptionEvent } from '../../index'

import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { describe, expect, it, vi } from 'vitest'

import { VoiceController } from '../../index'
import { keepOpen, pcmSource } from '../../testing/audio'

describe('voiceController end detection', () => {
  it('accepts onset activity when capture includes earlier padding', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream), { historyMs: 10 })
    const release = keepOpen(audio)
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 10 }, sampleRate: 1000, channels: [new Float32Array(10)] })
    await expect.poll(() => audio.position?.frame).toBe(10)
    const output = createPushStream<TranscriptionEvent>()
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit: vi.fn() })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'speech-onset', at: { sourceId: 'mic', frame: 8 }, preRollMs: 4 } })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    expect(attempt.noteActivity({ range: { sourceId: 'mic', startFrame: 8, endFrame: 10 }, speech: true })).toBe(true)
    attempt.cancel('Finished observation')
    release()
    await controller.close()
  })

  it('waits for admission, replaces detectors, and holds end proposals for overlapping VAD coverage', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit: async () => ({ status: 'drafted', draftId: 'draft' }) })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    const replaced = vi.fn(async () => 'end' as const)
    const first = attempt.detectEnd({ windowMs: 4, hopMs: 4, activity: 'ordered' }, replaced)
    const detected = vi.fn(async () => 'end' as const)
    const second = attempt.detectEnd({ windowMs: 4, hopMs: 4, activity: 'ordered' }, detected)
    expect(await first.done).toEqual({ status: 'cancelled', reason: 'Replaced by a new end detector' })
    expect(attempt.state).toEqual({ phase: 'pending', waitingFor: 'source' })
    // The first block admits the input, like a granted microphone permission. The detector observes later blocks.
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    source.write({ range: { sourceId: 'mic', startFrame: 4, endFrame: 8 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => detected.mock.calls.length).toBe(1)
    expect(replaced).not.toHaveBeenCalled()
    expect(attempt.state.phase).toBe('capturing')
    expect(attempt.noteActivity({ range: { sourceId: 'mic', startFrame: 0, endFrame: 6 }, speech: false })).toBe(true)
    expect(attempt.state.phase).toBe('capturing')
    expect(attempt.noteActivity({ range: { sourceId: 'mic', startFrame: 5, endFrame: 8 }, speech: false })).toBe(true)
    expect(attempt.state.phase).toBe('finalizing')
    expect(await second.done).toEqual({ status: 'cancelled', reason: 'Speech input is finalizing' })
    output.write({ type: 'complete', revision: 0 })
    output.close()
    expect((await attempt.done).status).toBe('drafted')
    const late = attempt.detectEnd({ windowMs: 4, hopMs: 4, activity: 'ordered' }, detected)
    expect(await late.done).toEqual({ status: 'cancelled', reason: 'Speech input is no longer capturing' })
    expect(detected).toHaveBeenCalledTimes(1)
    await controller.close()
  })
})
