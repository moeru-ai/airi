import type { SpeechInputAttempt, TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { describe, expect, it, vi } from 'vitest'

import { createVoiceRephrasePlugin } from './voice-rephrase-plugin'

function createHarness(rephrase: (segments: readonly string[], signal: AbortSignal) => Promise<readonly string[]>, enabled = true, speculateAfterMs = 600) {
  const source = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => source.stream })
  const output = createPushStream<TranscriptionEvent>()
  const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft' }))
  const controller = new VoiceController({ audio, submit, transcriber: () => ({ transcribe: () => output.stream }) })
  const onError = vi.fn()
  controller.use(createVoiceRephrasePlugin({ enabled: () => enabled, rephrase, timeoutMs: 1000, speculateAfterMs }), { onError })

  async function speak(updates: readonly { text: string, final: boolean }[][]): Promise<SpeechInputAttempt> {
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    updates.forEach((segments, index) => {
      output.write({ type: 'update', revision: index + 1, segments: segments.map((segment, position) => ({ id: `speech-${position}`, revision: index + 1, text: segment.text, tokens: [], final: segment.final })) })
    })
    void attempt.end()
    output.write({ type: 'complete', revision: updates.length })
    output.close()
    await attempt.done
    return attempt
  }

  /** Starts an input and returns commands that drive its provider output step by step. */
  async function open() {
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    let revision = 0
    return {
      attempt,
      update(text: string, final = false) {
        revision += 1
        output.write({ type: 'update', revision, segments: [{ id: 'speech-0', revision, text, tokens: [], final }] })
      },
      async end() {
        void attempt.end()
        output.write({ type: 'complete', revision })
        output.close()
        return attempt.done
      },
    }
  }

  return { controller, submit, speak, open, onError }
}

describe('createVoiceRephrasePlugin', () => {
  it('rewrites each final segment and keeps the provider text as raw history', async () => {
    const rephrase = vi.fn(async () => ['Check the weather.', 'Shanghai, tomorrow.'])
    const { controller, submit, speak } = createHarness(rephrase)

    const attempt = await speak([
      [{ text: 'um check the ', final: false }],
      [{ text: 'um check the weather. ', final: true }, { text: 'Shanghai tomorrow', final: true }],
    ])

    expect(rephrase).toHaveBeenCalledOnce()
    expect(rephrase).toHaveBeenCalledWith(['um check the weather. ', 'Shanghai tomorrow'], expect.any(AbortSignal))
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'Check the weather. Shanghai, tomorrow.' }), expect.any(AbortSignal))
    expect(attempt.input?.transcript.raw.text).toBe('um check the weather. Shanghai tomorrow')
    // Segment-level evidence, such as a speaker label, stays on the segment that it describes.
    expect(attempt.input?.transcript.corrected.segments.map(segment => [segment.id, segment.text])).toEqual([
      ['speech-0', 'Check the weather. '],
      ['speech-1', 'Shanghai, tomorrow.'],
    ])
    await controller.close()
  })

  it('leaves unchanged segments without a patch edit', async () => {
    const { controller, speak } = createHarness(async () => ['Hello there.', 'How are you?'])

    const attempt = await speak([[{ text: 'Hello there. ', final: true }, { text: 'how are you', final: true }]])

    const edits = attempt.input?.transcript.patchHistory.flatMap(patch => patch.edits) ?? []
    expect(edits.map(edit => edit.segmentId)).toEqual(['speech-1'])
    await controller.close()
  })

  it('keeps the provider text when the model returns another number of segments', async () => {
    const { controller, submit, speak, onError } = createHarness(async () => ['Hello there, how are you?'])

    const attempt = await speak([[{ text: 'hello there ', final: true }, { text: 'how are you', final: true }]])

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello there how are you' }), expect.any(AbortSignal))
    expect(attempt.input?.transcript.patchHistory).toEqual([])
    expect(onError).not.toHaveBeenCalled()
    await controller.close()
  })

  it('submits the provider text when rephrasing is disabled', async () => {
    const rephrase = vi.fn(async () => ['rewritten'])
    const { controller, submit, speak } = createHarness(rephrase, false)

    await speak([[{ text: 'hello there', final: true }]])

    expect(rephrase).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello there' }), expect.any(AbortSignal))
    await controller.close()
  })

  it('submits the provider text when the model fails', async () => {
    const { controller, submit, speak } = createHarness(async () => {
      throw new Error('model unavailable')
    })

    await speak([[{ text: 'hello there', final: true }]])

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello there' }), expect.any(AbortSignal))
    await controller.close()
  })

  it('reuses a speculative rewrite when the final text did not change', async () => {
    const reply = Promise.withResolvers<readonly string[]>()
    const rephrase = vi.fn(() => reply.promise)
    const { controller, submit, open } = createHarness(rephrase, true, 10)
    const input = await open()
    input.update('um check the weather')
    // The speaker pauses, so the rewrite starts before the input ends.
    await expect.poll(() => rephrase.mock.calls.length).toBe(1)
    input.update('um check the weather', true)
    const done = input.end()
    reply.resolve(['Check the weather.'])

    expect((await done).status).toBe('drafted')
    expect(rephrase).toHaveBeenCalledOnce()
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'Check the weather.' }), expect.any(AbortSignal))
    await controller.close()
  })

  it('aborts a speculative rewrite when the speaker continues, and rewrites the final text', async () => {
    const signals: AbortSignal[] = []
    const rephrase = vi.fn(async (segments: readonly string[], signal: AbortSignal) => {
      signals.push(signal)
      return segments[0] === 'turn on the light' ? ['Turn on the light.'] : new Promise<readonly string[]>(() => {})
    })
    const { controller, submit, open } = createHarness(rephrase, true, 10)
    const input = await open()
    input.update('turn on the')
    await expect.poll(() => rephrase.mock.calls.length).toBe(1)
    input.update('turn on the light', true)

    await expect.poll(() => signals[0]?.aborted).toBe(true)
    expect((await input.end()).status).toBe('drafted')
    expect(rephrase).toHaveBeenLastCalledWith(['turn on the light'], expect.any(AbortSignal))
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'Turn on the light.' }), expect.any(AbortSignal))
    await controller.close()
  })

  it('starts a new rewrite when the speculative request failed', async () => {
    const rephrase = vi.fn()
      .mockRejectedValueOnce(new Error('model busy'))
      .mockResolvedValueOnce(['Hello there.'])
    const { controller, submit, open, onError } = createHarness(rephrase, true, 10)
    const input = await open()
    input.update('hello there', true)
    await expect.poll(() => rephrase.mock.calls.length).toBe(1)

    expect((await input.end()).status).toBe('drafted')
    expect(rephrase).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello there.' }), expect.any(AbortSignal))
    expect(onError).not.toHaveBeenCalled()
    await controller.close()
  })
})
