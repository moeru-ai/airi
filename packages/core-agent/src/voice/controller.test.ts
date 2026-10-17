import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { AudioPluginTask, SpeechInputControl, TranscriptionEvent, WriteResult } from '../index'

import { AudioInput, capture, observe } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { describe, expect, it, vi } from 'vitest'

import { VoiceController } from '../index'
import { pcmSource } from '../testing/audio'

describe('voiceController input', () => {
  it('does not open the source for an already-cancelled plugin observation', async () => {
    const source = pcmSource(createPushStream<PcmBlock>().stream)
    const controller = new VoiceController({ audio: new AudioInput(source), transcriber: vi.fn(), submit: vi.fn() })
    const cancelled = AbortSignal.abort('Plugin no longer needs audio')
    controller.use({ name: 'cancelled-detector', setup(scope) {
      scope.observeAudio({ windowMs: 32, hopMs: 32, signal: cancelled }, async () => {})
    } })
    expect(source.open).not.toHaveBeenCalled()
    await controller.close()
  })

  it('keeps a manual word correction when the provider finalizes unchanged text and appends more words', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'manual' }))
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    const segment = { id: 'words', revision: 1, text: 'air', tokens: [{ text: 'air', start: 0, end: 3 }], final: false }
    output.write({ type: 'update', revision: 1, segments: [segment] })
    await expect.poll(() => attempt.input?.transcript.raw.text).toBe('air')
    expect(controller.correctInput(attempt.id, [{ segmentId: 'words', range: { kind: 'tokens', start: 0, end: 1 }, expectedText: 'air', replacement: 'AIRI' }])).toEqual({ status: 'applied' })
    output.write({ type: 'update', revision: 2, segments: [{ ...segment, revision: 2, text: 'air listens', final: true }] })
    await expect.poll(() => attempt.input?.transcript.raw.text).toBe('air listens')
    expect(attempt.input?.transcript.corrected.text).toBe('AIRI listens')
    void attempt.end()
    output.write({ type: 'complete', revision: 2 })
    output.close()
    expect((await attempt.done).status).toBe('drafted')
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'AIRI listens' }), expect.any(AbortSignal))
    await controller.close()
  })

  it('rejects empty token edits and fails a provider that changes token coordinates without a segment revision', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const submit = vi.fn()
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    const segment = { id: 'words', revision: 1, text: 'ab', tokens: [{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2 }], final: false }
    output.write({ type: 'update', revision: 1, segments: [segment] })
    await expect.poll(() => attempt.input?.transcript.raw.text).toBe('ab')
    expect(controller.correctInput(attempt.id, [{ segmentId: 'words', range: { kind: 'tokens', start: 1, end: 1 }, expectedText: '', replacement: 'X' }])).toEqual({ status: 'rejected', reason: 'conflict' })
    output.write({ type: 'update', revision: 2, segments: [{ ...segment, tokens: [{ text: 'ab', start: 0, end: 2 }] }] })
    expect(await attempt.done).toMatchObject({ status: 'failed', stage: 'transcription' })
    expect(submit).not.toHaveBeenCalled()
    await controller.close()
  })

  it('cancels an input that waits for the old source and releases that source after replacement', async () => {
    const oldClosed = vi.fn()
    const oldAudio = new AudioInput(pcmSource(createPushStream<PcmBlock>().stream, oldClosed))
    const nextAudio = new AudioInput(pcmSource(createPushStream<PcmBlock>().stream))
    const controller = new VoiceController({ audio: oldAudio, transcriber: () => ({ transcribe: vi.fn() }), submit: vi.fn() })
    const first = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await expect.poll(() => first.state).toEqual({ phase: 'pending', waitingFor: 'source' })

    controller.replaceAudio(nextAudio)

    expect((await first.done).status).toBe('cancelled')
    await expect.poll(() => oldClosed.mock.calls.length).toBe(1)
    expect(controller.audio).toBe(nextAudio)
    await controller.close()
  })

  it('moves plugin observations to the replacement input without closing another consumer', async () => {
    const frames = createPushStream<PcmBlock>()
    const closed = vi.fn()
    const audio = new AudioInput(pcmSource(frames.stream, closed))
    const next = new AudioInput(pcmSource(createPushStream<PcmBlock>().stream))
    const controller = new VoiceController({ audio })
    const detected = vi.fn(async (_task: AudioPluginTask) => {})
    const independent = vi.fn(async () => {})
    const other = observe(audio, { windowMs: 4, hopMs: 4 }, independent, () => {})
    controller.use({ name: 'detector', setup(scope) {
      scope.observeAudio({ windowMs: 4, hopMs: 4 }, detected)
    } })

    controller.replaceAudio(next)
    frames.write({ range: { sourceId: 'old', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })

    await expect.poll(() => independent.mock.calls.length).toBe(1)
    expect(detected).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
    other.cancel('Test finished')
    await controller.close()
  })

  it('resumes an installed audio plugin on the replacement source', async () => {
    const oldFrames = createPushStream<PcmBlock>()
    const nextFrames = createPushStream<PcmBlock>()
    const oldAudio = new AudioInput(pcmSource(oldFrames.stream, async () => {}))
    const nextAudio = new AudioInput(pcmSource(nextFrames.stream, async () => {}))
    const controller = new VoiceController({ audio: oldAudio })
    const detected = vi.fn(async (_task: AudioPluginTask) => {})
    controller.use({ name: 'detector', setup(scope) {
      scope.observeAudio({ windowMs: 4, hopMs: 4 }, detected)
    } })

    controller.replaceAudio(nextAudio)
    nextFrames.write({ range: { sourceId: 'next', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => detected.mock.calls.length).toBe(1)
    expect(detected.mock.calls[0][0].window.range.sourceId).toBe('next')
    await controller.close()
  })

  it('keeps the shared input available after the controller closes', async () => {
    const frames = createPushStream<PcmBlock>()
    const close = vi.fn()
    const audio = new AudioInput(pcmSource(frames.stream, close))
    const controller = new VoiceController({ audio, transcriber: vi.fn(), submit: vi.fn() })
    await controller.close()
    expect(close).not.toHaveBeenCalled()

    const recording = capture(audio)
    frames.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 1000, channels: [new Float32Array([0.25, 0.5])] })

    expect((await recording.stream.getReader().read()).value?.channels[0]).toEqual(new Float32Array([0.25, 0.5]))
    await recording.finish()
    await expect.poll(() => close.mock.calls.length).toBe(1)
  })

  it('reports a failed finalization stage and still submits the input', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const errors = vi.fn()
    const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft' }))
    const later = vi.fn()
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.finalize(() => {
          throw new Error('Memory unavailable')
        })
        input.finalize(later)
      })
    } }, { onError: errors })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    void attempt.end()
    output.write({ type: 'complete', revision: 0 })
    output.close()

    expect((await attempt.done).status).toBe('drafted')
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ plugin: 'memory', stage: 'finalize', error: expect.objectContaining({ message: 'Memory unavailable' }) }))
    expect(later).toHaveBeenCalledOnce()
    expect(submit).toHaveBeenCalledOnce()
    await controller.close()
  })

  it('submits without the later writes of a finalization stage that exceeds its timeout', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const errors = vi.fn()
    const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft' }))
    const stage = Promise.withResolvers<AbortSignal>()
    const release = Promise.withResolvers<void>()
    const writes: WriteResult[] = []
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.finalize(async (ctx) => {
          stage.resolve(ctx.signal)
          await release.promise
          writes.push(ctx.attach('late', true))
        }, { timeoutMs: 5 })
      })
    } }, { onError: errors })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    void attempt.end()
    output.write({ type: 'complete', revision: 0 })
    output.close()

    expect((await attempt.done).status).toBe('drafted')
    expect((await stage.promise).aborted).toBe(true)
    release.resolve()
    await expect.poll(() => writes).toEqual([{ status: 'rejected', reason: 'closed' }])
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ context: [] }), expect.any(AbortSignal))
    expect(errors).not.toHaveBeenCalled()
    await controller.close()
  })

  it('freezes speaker evidence before finalization starts', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const waiting = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit: async () => ({ status: 'drafted', draftId: 'draft' }) })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.finalize(async () => {
          waiting.resolve()
          await finish.promise
        })
      })
    } })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    await expect.poll(() => audio.position?.frame).toBe(4)
    const evidence = { range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, value: { voicedMs: 4, candidates: [{ speakerId: 'speaker', score: 0.7 }] } }
    expect(controller.updateSpeakerEvidence(attempt.id, evidence)).toEqual({ status: 'applied' })
    void attempt.end()
    output.write({ type: 'complete', revision: 0 })
    output.close()
    await waiting.promise
    expect(controller.updateSpeakerEvidence(attempt.id, evidence)).toEqual({ status: 'rejected', reason: 'closed' })
    finish.resolve()
    expect((await attempt.done).status).toBe('drafted')
    await controller.close()
  })

  it('reports detector failures without letting a diagnostic callback block disposal', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const diagnostics = vi.fn()
    const onError = vi.fn(() => {
      throw new Error('Diagnostic sink failed')
    })
    const controller = new VoiceController({ audio, onError: diagnostics, transcriber: vi.fn(), submit: vi.fn() })
    let observation: import('@proj-airi/pipelines-audio').Observer | undefined
    const observing = Promise.withResolvers<void>()
    controller.use({ name: 'speaker', setup(plugin) {
      observation = plugin.observeAudio({ windowMs: 4, hopMs: 4 }, async () => {
        throw new Error('Model failed')
      })
      observing.resolve()
    } }, { onError })
    await observing.promise
    await Promise.resolve()
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    expect((await observation!.done).status).toBe('failed')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ plugin: 'speaker', stage: 'audio' }))
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ stage: 'plugin-diagnostic' }))
    await controller.close()
  })

  it('settles cancellation and releases the provider when a UI subscriber throws', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const onError = vi.fn()
    let signal: AbortSignal | undefined
    const controller = new VoiceController({ audio, onError, transcriber: () => ({ transcribe: (request) => {
      signal = request.signal
      return output.stream
    } }), submit: vi.fn() })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    attempt.subscribe((state) => {
      if (state.phase === 'settled')
        throw new Error('UI render failed')
    })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    expect(() => attempt.cancel('button')).not.toThrow()
    expect(await attempt.done).toEqual({ status: 'cancelled', reason: 'button' })
    expect(signal?.aborted).toBe(true)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ stage: 'subscriber', error: expect.any(Error) }))
    await controller.close()
  })

  it('revokes a retained input control after its input closes', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit: vi.fn() })
    let retained: SpeechInputControl | undefined
    let withoutGrant: SpeechInputControl | undefined
    controller.use({ name: 'controls', setup(plugin) {
      plugin.onSpeechInput((input) => {
        retained = input.control
      })
    } }, { grants: ['input-control', 'cancel-input'] })
    controller.use({ name: 'reader', setup(plugin) {
      plugin.onSpeechInput((input) => {
        withoutGrant = input.control
      })
    } })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => retained).toBeDefined()

    expect(retained!.sessionId).toBe('alice')
    expect(withoutGrant).toBeUndefined()
    attempt.cancel('done')
    expect(retained!.cancel('late detached callback')).toBe('denied')
    expect(retained!.end()).toEqual({ status: 'denied' })
    await controller.close()
  })

  it('runs finalization stages in installation order, and each stage sees earlier corrections', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const seen: string[] = []
    const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft' }))
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit })
    controller.use({ name: 'rewrite', setup(plugin) {
      plugin.onSpeechInput(async (input) => {
        // An asynchronous install still registers its stage before finalization.
        await Promise.resolve()
        input.finalize((ctx) => {
          seen.push(`rewrite:${ctx.document.corrected.text}`)
          ctx.patch([{ segmentId: 'one', range: { kind: 'tokens', start: 0, end: 1 }, expectedText: 'air', replacement: 'AIRI' }])
        })
      })
    } })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.finalize((ctx) => {
          seen.push(`memory:${ctx.document.corrected.text}`)
          ctx.attach('matches', ['AIRI'])
        })
      })
    } })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    output.write({ type: 'update', revision: 1, segments: [{ id: 'one', revision: 1, text: 'air listens', tokens: [{ text: 'air', start: 0, end: 3 }], final: true }] })
    void attempt.end()
    output.write({ type: 'complete', revision: 1 })
    output.close()

    expect((await attempt.done).status).toBe('drafted')
    expect(seen).toEqual(['rewrite:air listens', 'memory:AIRI listens'])
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      text: 'AIRI listens',
      transcript: expect.objectContaining({ raw: expect.objectContaining({ text: 'air listens' }) }),
      context: [{ plugin: 'memory', key: 'matches', value: ['AIRI'] }],
    }), expect.any(AbortSignal))
    await controller.close()
  })

  it('rejects plugin corrections while the provider still transcribes', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit: vi.fn() })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    output.write({ type: 'update', revision: 1, segments: [{ id: 'one', revision: 1, text: 'air', tokens: [], final: true }] })
    await expect.poll(() => attempt.input?.transcript.raw.text).toBe('air')

    expect(attempt.input!.patch('rewrite', { edits: [{ segmentId: 'one', range: { kind: 'segment' }, expectedText: 'air', replacement: 'AIRI' }], evidenceIds: [] })).toEqual({ status: 'rejected', reason: 'denied' })
    expect(attempt.input!.transcript.corrected.text).toBe('air')
    attempt.cancel('done')
    await controller.close()
  })

  it('aborts superseded speculation and reuses the speculation for unchanged final text', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    const started: string[] = []
    const aborted: string[] = []
    const speculation = new Map<string, Promise<string>>()
    const submit = vi.fn(async () => ({ status: 'committed' as const, messageId: 'message' }))
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe: () => output.stream }), submit })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.watch(async (document, signal) => {
          const text = document.raw.text
          if (!text)
            return
          started.push(text)
          signal.addEventListener('abort', () => aborted.push(text), { once: true })
          speculation.set(text, Promise.resolve(`memory for ${text}`))
        }, { key: document => document.raw.text })
        input.finalize(async (ctx) => {
          const text = ctx.document.raw.text
          ctx.attach('matches', await (speculation.get(text) ?? Promise.resolve('fresh search')))
        })
      })
    } })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    output.write({ type: 'update', revision: 1, segments: [{ id: 'one', revision: 1, text: 'hello', tokens: [], final: false }] })
    output.write({ type: 'update', revision: 2, segments: [{ id: 'one', revision: 2, text: 'hello there', tokens: [], final: false }] })
    // The provider finalizes the same text. Its key does not change, so the speculation stays.
    output.write({ type: 'update', revision: 3, segments: [{ id: 'one', revision: 3, text: 'hello there', tokens: [], final: true }] })
    void attempt.end()
    output.write({ type: 'complete', revision: 3 })
    output.close()

    expect((await attempt.done).status).toBe('committed')
    expect(started).toEqual(['hello', 'hello there'])
    expect(aborted).toContain('hello')
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ context: [{ plugin: 'memory', key: 'matches', value: 'memory for hello there' }] }), expect.any(AbortSignal))
    await controller.close()
  })

  it('does not transcribe when an input ends before its source delivers audio', async () => {
    const close = vi.fn()
    const transcribe = vi.fn()
    const submit = vi.fn()
    const controller = new VoiceController({ audio: new AudioInput(pcmSource(createPushStream<PcmBlock>().stream, close)), transcriber: () => ({ transcribe }), submit })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    expect(attempt.state).toEqual({ phase: 'pending', waitingFor: 'source' })

    expect((await attempt.end()).status).toBe('cancelled')

    await expect.poll(() => close.mock.calls.length).toBe(1)
    expect(transcribe).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
    await controller.close()
  })

  it('publishes partial transcription during capture and waits for final output after end', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream))
    const output = createPushStream<TranscriptionEvent>()
    let providerSignal: AbortSignal | undefined
    let audioReader: ReadableStreamDefaultReader<PcmBlock> | undefined
    const submit = vi.fn(async () => ({ status: 'committed' as const, messageId: 'message-1' }))
    const controller = new VoiceController({
      audio,
      transcriber: () => ({
        transcribe({ audio: input, signal }) {
          providerSignal = signal
          audioReader = input.getReader()
          return output.stream
        },
      }),
      submit,
    })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 16000, channels: [new Float32Array(2)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    expect((await audioReader!.read()).value?.range.endFrame).toBe(2)
    output.write({ type: 'update', revision: 1, segments: [{ id: 'first', revision: 1, text: 'hello', tokens: [], final: false }] })
    await expect.poll(() => attempt.input?.transcript.raw.text).toBe('hello')
    expect(attempt.state.phase).toBe('capturing')
    const done = attempt.end()
    expect(controller.activeInput).toBeUndefined()
    expect((await audioReader!.read()).done).toBe(true)
    expect(providerSignal?.aborted).toBe(false)
    expect(submit).not.toHaveBeenCalled()
    output.write({ type: 'update', revision: 2, segments: [{ id: 'first', revision: 2, text: 'hello world', tokens: [], final: true }] })
    output.write({ type: 'complete', revision: 2 })
    output.close()
    expect(await done).toEqual({ status: 'committed', messageId: 'message-1' })
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'alice', text: 'hello world', submissionId: attempt.id }), expect.any(AbortSignal))
    await controller.close()
  })
})
