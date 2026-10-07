import type { SpeechInputAttempt, TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { describe, expect, it, vi } from 'vitest'

import { createVoiceRephrasePlugin, parseRephrasedSegments } from './voice-rephrase-plugin'

function createHarness(rephrase: (segments: readonly string[], signal: AbortSignal) => Promise<readonly string[]>, enabled = true) {
  const source = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => source.stream })
  const output = createPushStream<TranscriptionEvent>()
  const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft' }))
  const controller = new VoiceController({ audio, submit, transcriber: () => ({ transcribe: () => output.stream }) })
  const onError = vi.fn()
  controller.use(createVoiceRephrasePlugin({ enabled: () => enabled, rephrase, timeoutMs: 1000 }), { grants: ['transcript-patch'], onError })

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

  return { controller, submit, speak, onError }
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
})

describe('parseRephrasedSegments', () => {
  it('reads a JSON array, also inside a Markdown code fence', () => {
    expect(parseRephrasedSegments('["Hello.", ""]')).toEqual(['Hello.', ''])
    expect(parseRephrasedSegments('```json\n["Hello."]\n```')).toEqual(['Hello.'])
  })

  it('rejects a reply that is not an array of strings', () => {
    expect(() => parseRephrasedSegments('Hello.')).toThrow()
    expect(() => parseRephrasedSegments('{"text":"Hello."}')).toThrow()
    expect(() => parseRephrasedSegments('[1, 2]')).toThrow()
  })
})
