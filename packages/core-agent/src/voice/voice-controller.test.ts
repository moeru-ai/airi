import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { TranscriptionEvent, VoicePluginControls, WriteResult } from '../index'

import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { describe, expect, it, vi } from 'vitest'

import { VoiceController } from '../index'

describe('voiceController input', () => {
  it('does not request microphone permission for an already-cancelled plugin observation', async () => {
    const open = vi.fn(async (): Promise<AudioInput> => {
      throw new Error('Permission must not be requested')
    })
    const controller = new VoiceController({ audio: open, transcriber: vi.fn(), submit: vi.fn() })
    const cancelled = AbortSignal.abort('Plugin no longer needs audio')
    controller.use({ name: 'cancelled-detector', setup(scope) {
      scope.observeAudio({ windowMs: 32, hopMs: 32, signal: cancelled }, async () => {})
    } })
    expect(open).not.toHaveBeenCalled()
    await controller.close()
  })

  it('keeps a manual word correction when the provider finalizes unchanged text and appends more words', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: vi.fn() })
    const output = createPushStream<TranscriptionEvent>()
    const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'manual' }))
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
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
    const audio = new AudioInput({ id: 'mic', frames: createPushStream<PcmBlock>().stream, close: async () => {} }, { supportsFile: () => false, encode: vi.fn() })
    const output = createPushStream<TranscriptionEvent>()
    const submit = vi.fn()
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    const segment = { id: 'words', revision: 1, text: 'ab', tokens: [{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2 }], final: false }
    output.write({ type: 'update', revision: 1, segments: [segment] })
    await expect.poll(() => attempt.input?.transcript.raw.text).toBe('ab')
    expect(controller.correctInput(attempt.id, [{ segmentId: 'words', range: { kind: 'tokens', start: 1, end: 1 }, expectedText: '', replacement: 'X' }])).toEqual({ status: 'rejected', reason: 'conflict' })
    output.write({ type: 'update', revision: 2, segments: [{ ...segment, tokens: [{ text: 'ab', start: 0, end: 2 }] }] })
    expect(await attempt.done).toMatchObject({ status: 'failed', stage: 'transcription' })
    expect(submit).not.toHaveBeenCalled()
    await controller.close()
  })

  it('replaces pending microphone startup without allowing the old source to take ownership', async () => {
    const permission = Promise.withResolvers<AudioInput>()
    const oldFrames = createPushStream<PcmBlock>()
    const nextFrames = createPushStream<PcmBlock>()
    const oldClosed = vi.fn(async () => {})
    const codec = { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } }
    const oldAudio = new AudioInput({ id: 'old', frames: oldFrames.stream, close: oldClosed }, codec)
    const nextAudio = new AudioInput({ id: 'next', frames: nextFrames.stream, close: async () => {} }, codec)
    const controller = new VoiceController({ audio: () => permission.promise, transcriber: vi.fn(), submit: vi.fn() })
    const first = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await Promise.resolve()
    const replacing = controller.replaceAudio(nextAudio)
    expect((await first.done).status).toBe('cancelled')
    expect(await controller.acquireAudio()).toBe(nextAudio)
    permission.resolve(oldAudio)
    await replacing
    expect(oldClosed).toHaveBeenCalledOnce()
    expect(controller.availableAudio).toBe(nextAudio)
    await controller.close()
  })

  it('cancels old plugin observations when replacing borrowed audio without closing another consumer', async () => {
    const frames = createPushStream<PcmBlock>()
    const closed = vi.fn(async () => {})
    const audio = new AudioInput({ id: 'old', frames: frames.stream, close: closed }, { supportsFile: () => false, encode: vi.fn() })
    const next = new AudioInput({ id: 'next', frames: createPushStream<PcmBlock>().stream, close: async () => {} }, { supportsFile: () => false, encode: vi.fn() })
    const controller = new VoiceController({ audio, audioOwnership: 'borrowed' })
    const detected = vi.fn(async () => {})
    const independent = vi.fn(async () => {})
    audio.observe({ windowMs: 4, hopMs: 4 }, independent, () => {})
    controller.use({ name: 'detector', setup(scope) {
      scope.observeAudio({ windowMs: 4, hopMs: 4 }, detected)
    } })
    await controller.acquireAudio()
    await controller.replaceAudio(next)
    frames.write({ range: { sourceId: 'old', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => independent.mock.calls.length).toBe(1)
    expect(detected).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
    await controller.close()
    await audio.close()
    await next.close()
  })

  it('leaves a borrowed source available when a preview controller closes', async () => {
    const frames = createPushStream<PcmBlock>()
    const close = vi.fn(async () => {})
    const audio = new AudioInput({ id: 'mic', frames: frames.stream, close }, { supportsFile: () => false, encode: vi.fn() })
    const controller = new VoiceController({ audio, audioOwnership: 'borrowed', transcriber: vi.fn(), submit: vi.fn() })
    await controller.close()
    expect(close).not.toHaveBeenCalled()
    const capture = audio.capture({ delivery: 'pcm' })
    frames.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 1000, channels: [new Float32Array([0.25, 0.5])] })
    const reader = capture.media.getReader()
    expect((await reader.read()).value?.channels[0]).toEqual(new Float32Array([0.25, 0.5]))
    await capture.finish()
    await audio.close()
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes a supplied audio source even when no input starts', async () => {
    const source = createPushStream<PcmBlock>()
    const close = vi.fn(async () => {})
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const controller = new VoiceController({ audio, transcriber: vi.fn(), submit: vi.fn() })
    await controller.close()
    expect(close).toHaveBeenCalledOnce()
  })

  it('preserves input-plugin failure in pending lifecycle waits and diagnostics', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const output = createPushStream<TranscriptionEvent>()
    const result = Promise.withResolvers<import('./voice-plugin-types').TranscriptionEnd>()
    const waiting = Promise.withResolvers<void>()
    const errors = vi.fn()
    let fail: ((error: Error) => void) | undefined
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit: vi.fn() })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        fail = input.fail
        input.task({ name: 'final-memory', selection: { transcript: 'raw' } }, async (ctx) => {
          waiting.resolve()
          result.resolve(await ctx.untilTranscriptionEnded())
        })
      })
    } }, { onError: errors })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await waiting.promise
    const error = new Error('Memory unavailable')
    fail!(error)
    expect(await result.promise).toEqual({ status: 'failed', error })
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ plugin: 'memory', error }))
    expect(attempt.state.phase).toBe('capturing')
    attempt.cancel('done')
    await controller.close()
  })

  it('returns a failed lifecycle wait when a caller-selected task timeout expires', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const output = createPushStream<TranscriptionEvent>()
    const result = Promise.withResolvers<import('./voice-plugin-types').TranscriptionEnd>()
    const errors = vi.fn()
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit: vi.fn() })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.task({ name: 'final-memory', selection: { transcript: 'raw' }, timeoutMs: 1 }, async (ctx) => {
          result.resolve(await ctx.untilTranscriptionEnded())
        })
      })
    } }, { onError: errors })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    expect(await result.promise).toEqual({ status: 'failed', error: expect.any(Error) })
    expect(attempt.state.phase).toBe('capturing')
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ stage: 'task' }))
    attempt.cancel('done')
    await controller.close()
  })

  it('freezes speaker evidence before final enrichment starts', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const output = createPushStream<TranscriptionEvent>()
    const waiting = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit: async () => ({ status: 'drafted', draftId: 'draft' }) })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.task({ name: 'final-memory', selection: { transcript: 'raw', speakers: true }, waitForSubmissionMs: 1000 }, async (ctx) => {
          await ctx.untilTranscriptionEnded()
          waiting.resolve()
          await finish.promise
        })
      })
    } })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => audio.position.frame).toBe(4)
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
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
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
    await controller.acquireAudio()
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    expect((await observation!.done).status).toBe('failed')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ plugin: 'speaker', stage: 'subscription' }))
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ stage: 'plugin-diagnostic' }))
    await controller.close()
  })

  it('settles cancellation and releases the provider when a UI subscriber throws', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const output = createPushStream<TranscriptionEvent>()
    const onError = vi.fn()
    let signal: AbortSignal | undefined
    const controller = new VoiceController({ audio, onError, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: (request) => {
      signal = request.signal
      return output.stream
    } }), submit: vi.fn() })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
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

  it('revokes retained plugin controls after the owning callback ends', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const output = createPushStream<TranscriptionEvent>()
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit: vi.fn() })
    let retained: VoicePluginControls | undefined
    let sessionId: string | undefined
    const finished = Promise.withResolvers<void>()
    controller.use({ name: 'controls', setup(plugin) {
      plugin.onSpeechInput((input) => {
        const task = input.subscribe({ transcript: 'raw', scheduling: 'latest' }, async (ctx) => {
          retained = ctx.controls
          sessionId = ctx.controls.activeInput()?.sessionId
        })
        void task.done.then(() => finished.resolve())
      })
    } }, { grants: ['input-control', 'cancel-input'] })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await expect.poll(() => retained).toBeDefined()
    expect(sessionId).toBe('alice')
    expect(retained!.cancelInput(attempt.id, 'late detached callback')).toBe('denied')
    expect(attempt.state.phase).toBe('capturing')
    attempt.cancel('done')
    await finished.promise
    await controller.close()
  })

  it('rejects corrected-memory feedback before any plugin callback runs', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const output = createPushStream<TranscriptionEvent>()
    const run = vi.fn(async () => {})
    const onError = vi.fn()
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit: async () => ({ status: 'drafted', draftId: 'unused' }) })
    controller.use({ name: 'memory', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.subscribe({ transcript: 'corrected', scheduling: 'latest' }, run)
      })
    } }, { onError })
    controller.use({ name: 'rewrite', setup(plugin) {
      plugin.onSpeechInput((input) => {
        input.subscribe({ transcript: 'raw', context: [{ plugin: 'memory', key: 'matches' }], scheduling: 'latest' }, run)
      })
    } }, { dependsOn: ['memory'], grants: ['transcript-patch'], onError })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ stage: 'dependency', error: expect.any(Error) }))
    expect(run).not.toHaveBeenCalled()
    attempt.cancel('test finished')
    await controller.close()
  })

  it('accepts a segment rewrite after unrelated text is appended and preserves raw text', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => false,
      encode: async () => {
        throw new Error('No codec')
      },
    })
    const output = createPushStream<TranscriptionEvent>()
    const rewrite = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const writes: WriteResult[] = []
    const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'corrected-draft' }))
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit })
    controller.use({
      name: 'rewrite',
      setup(plugin) {
        plugin.onSpeechInput((input) => {
          input.subscribe({ transcript: 'raw', scope: { kind: 'segment', neighbors: 0 }, scheduling: 'latest', waitForSubmissionMs: 1000 }, async (ctx) => {
            if (ctx.snapshot.transcript.targetSegmentId !== 'first')
              return
            started.resolve()
            await rewrite.promise
            writes.push(ctx.patch({ edits: [{ segmentId: 'first', range: { kind: 'tokens', start: 0, end: 1 }, expectedText: 'air', replacement: 'AIRI' }], evidenceIds: ['fuzzy-match'] }))
          })
        })
      },
    }, { grants: ['transcript-patch'] })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    const first = { id: 'first', revision: 1, text: 'air', tokens: [{ text: 'air', start: 0, end: 3 }], final: true }
    output.write({ type: 'update', revision: 1, segments: [first] })
    await started.promise
    output.write({ type: 'update', revision: 2, segments: [first, { id: 'second', revision: 1, text: ' listens', tokens: [], final: true }] })
    await expect.poll(() => attempt.input?.transcript.raw.text).toBe('air listens')
    rewrite.resolve()
    await expect.poll(() => writes).toEqual([{ status: 'applied' }])
    expect(attempt.input?.transcript.corrected.text).toBe('AIRI listens')
    expect(attempt.input?.transcript.raw.text).toBe('air listens')
    void attempt.end()
    output.write({ type: 'complete', revision: 2 })
    output.close()
    expect((await attempt.done).status).toBe('drafted')
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'AIRI listens' }), expect.any(AbortSignal))
    await controller.close()
  })

  it('rejects stale memory, keeps generic context, and runs final processing outside the subscription slot', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => false,
      encode: async () => {
        throw new Error('No codec')
      },
    })
    const output = createPushStream<TranscriptionEvent>()
    const search = Promise.withResolvers<void>()
    const seen: string[] = []
    const writes: WriteResult[] = []
    const records = new Map([['memory', 'remember this']])
    const submit = vi.fn(async () => ({ status: 'committed' as const, messageId: 'with-memory' }))
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['pcm'], output: 'updates' }, transcribe: () => output.stream }), submit })
    controller.use({
      name: 'memory',
      setup(plugin) {
        plugin.onSpeechInput((input) => {
          input.subscribe({ transcript: 'raw', scheduling: 'latest' }, async (ctx) => {
            seen.push(ctx.snapshot.transcript.text)
            if (!ctx.snapshot.transcript.text) {
              await search.promise
              writes.push(ctx.context.set('partial', records))
            }
          })
          input.task({ name: 'final', selection: { transcript: 'raw' }, waitForSubmissionMs: 1000 }, async (task) => {
            const result = await task.untilTranscriptionEnded()
            if (result.status === 'finished')
              writes.push(result.value.context.set('final', records))
          })
        })
      },
    })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await expect.poll(() => seen).toEqual([''])
    output.write({ type: 'update', revision: 1, segments: [{ id: 'one', revision: 1, text: 'hello', tokens: [], final: true }] })
    await expect.poll(() => attempt.input?.transcript.raw.text).toBe('hello')
    search.resolve()
    await expect.poll(() => seen).toEqual(['', 'hello'])
    expect(writes).toEqual([{ status: 'rejected', reason: 'stale' }])
    void attempt.end()
    output.write({ type: 'complete', revision: 1 })
    output.close()
    expect((await attempt.done).status).toBe('committed')
    expect(writes).toEqual([{ status: 'rejected', reason: 'stale' }, { status: 'applied' }])
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ context: [{ plugin: 'memory', key: 'final', revision: expect.any(Number), value: records }] }), expect.any(AbortSignal))
    await controller.close()
  })

  it('does not transcribe a permission result after the pending attempt was cancelled', async () => {
    const permission = Promise.withResolvers<AudioInput>()
    const transcriber = vi.fn()
    const submit = vi.fn()
    const controller = new VoiceController({ audio: () => permission.promise, transcriber, submit })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    expect(attempt.state).toEqual({ phase: 'pending', waitingFor: 'source' })
    expect((await attempt.end()).status).toBe('cancelled')
    const source = createPushStream<PcmBlock>()
    const close = vi.fn(async () => {})
    const audio = new AudioInput({ id: 'late', frames: source.stream, close }, {
      supportsFile: () => false,
      encode: async () => {
        throw new Error('No codec')
      },
    })
    permission.resolve(audio)
    await controller.close()
    expect(close).toHaveBeenCalledTimes(1)
    expect(transcriber).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits file-only transcription after encoding completes', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => true,
      async encode(frames) {
        const reader = frames.getReader()
        while (!(await reader.read()).done) {
          // Consume all accepted frames before completing the external encoder.
        }
        reader.releaseLock()
        return new Blob(['wav'], { type: 'audio/wav' })
      },
    })
    const output = createPushStream<TranscriptionEvent>()
    const transcribe = vi.fn(() => output.stream)
    const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft-1' }))
    const controller = new VoiceController({ audio, transcriber: () => ({ capabilities: { inputs: ['file'], output: 'final' }, transcribe }), submit })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    expect(transcribe).not.toHaveBeenCalled()
    void attempt.end()
    await expect.poll(() => transcribe.mock.calls.length).toBe(1)
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ audio: { kind: 'file', blob: expect.any(Blob) } }))
    output.write({ type: 'update', revision: 1, segments: [{ id: 'file', revision: 1, text: 'draft', tokens: [], final: true }] })
    output.write({ type: 'complete', revision: 1 })
    output.close()
    expect(await attempt.done).toEqual({ status: 'drafted', draftId: 'draft-1' })
    await controller.close()
  })

  it('publishes partial transcription during capture and waits for final output after end', async () => {
    const source = createPushStream<PcmBlock>()
    const audio = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => false,
      encode: async () => {
        throw new Error('No codec')
      },
    })
    const output = createPushStream<TranscriptionEvent>()
    let providerSignal: AbortSignal | undefined
    let audioReader: ReadableStreamDefaultReader<PcmBlock> | undefined
    const submit = vi.fn(async () => ({ status: 'committed' as const, messageId: 'message-1' }))
    const controller = new VoiceController({
      audio,
      transcriber: () => ({
        capabilities: { inputs: ['pcm'], output: 'updates' },
        transcribe({ audio: input, signal }) {
          providerSignal = signal
          if (input.kind !== 'pcm')
            throw new Error('Expected PCM')
          audioReader = input.stream.getReader()
          return output.stream
        },
      }),
      submit,
    })
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 16000, channels: [new Float32Array(2)] })
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
