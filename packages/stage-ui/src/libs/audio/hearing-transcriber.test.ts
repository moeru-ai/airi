import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { AIRIStreamTranscriptionDelta } from '../providers/stream-transcription'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { expect, it, vi } from 'vitest'

import { createHearingTranscriber } from './hearing-transcriber'

it('streams provider updates before capture ends and preserves the final response after normal finish', async () => {
  const frames = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => frames.stream })
  const events = createPushStream<AIRIStreamTranscriptionDelta>()
  const final = Promise.withResolvers<string>()
  let requestSignal: AbortSignal | undefined
  const transcriber = createHearingTranscriber(async (_audio, signal) => {
    requestSignal = signal
    return { mode: 'stream', fullStream: events.stream, text: final.promise, textStream: new ReadableStream<string>() }
  })
  const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'saved' }))
  const controller = new VoiceController({ audio, transcriber: () => transcriber, submit })
  const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
  frames.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
  events.write({ type: 'transcript.text.delta', delta: 'part' })
  await expect.poll(() => attempt.input?.transcript.raw.text).toBe('part')
  expect(attempt.input?.transcript.raw.segments[0]?.tokens).toEqual([{ text: 'part', start: 0, end: 4 }])
  expect(attempt.state.phase).toBe('capturing')
  expect(submit).not.toHaveBeenCalled()
  void attempt.end()
  expect(requestSignal?.aborted).toBe(false)
  events.write({ type: 'transcript.text.snapshot', text: 'partial corrected', isFinal: true, locale: 'en', startMilliseconds: 0, durationMilliseconds: 100 })
  events.close()
  final.resolve('partial corrected and final tail')
  expect(await attempt.done).toEqual({ status: 'drafted', draftId: 'saved' })
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'alice', text: 'partial corrected and final tail' }), expect.any(AbortSignal))
  expect(attempt.input?.transcript.raw.segments[0]?.tokens.at(-1)).toEqual({ text: 'tail', start: 28, end: 32 })
  await controller.close()
})

it('releases a late provider stream after the owning input was cancelled', async () => {
  const result = Promise.withResolvers<import('../providers/transcription-types').HearingTranscriptionResult>()
  const abort = new AbortController()
  const release = vi.fn()
  const transcriber = createHearingTranscriber(() => result.promise)
  const reader = transcriber.transcribe({ audio: new ReadableStream<PcmBlock>(), signal: abort.signal }).getReader()
  const read = reader.read().catch(() => undefined)
  abort.abort('cancelled')
  await read
  result.resolve({ mode: 'stream', fullStream: new ReadableStream({ cancel: release }), text: Promise.resolve('late'), textStream: new ReadableStream<string>() })
  await expect.poll(() => release).toHaveBeenCalledTimes(1)
})

it('fails the input when final transcription rejects before its event stream closes', async () => {
  const frames = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => frames.stream })
  const final = Promise.withResolvers<string>()
  const released = vi.fn()
  const transcriber = createHearingTranscriber(async () => ({ mode: 'stream', fullStream: new ReadableStream({ cancel: released }), text: final.promise, textStream: new ReadableStream<string>() }))
  const submit = vi.fn()
  const controller = new VoiceController({ audio, transcriber: () => transcriber, submit })
  const input = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
  frames.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
  await expect.poll(() => input.state.phase).toBe('capturing')
  final.reject(new Error('ASR connection failed'))
  await expect.poll(() => input.state.phase).toBe('settled')
  expect(await input.done).toMatchObject({ status: 'failed', stage: 'transcription', error: { message: 'ASR connection failed' } })
  expect(released).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
  await controller.close()
})

it('retains a sentence correction when another sentence appends to streaming transcription', async () => {
  const frames = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => frames.stream })
  const events = createPushStream<AIRIStreamTranscriptionDelta>()
  const final = Promise.withResolvers<string>()
  const transcriber = createHearingTranscriber(async () => ({ mode: 'stream', fullStream: events.stream, text: final.promise, textStream: new ReadableStream<string>() }))
  const controller = new VoiceController({ audio, transcriber: () => transcriber, submit: async () => ({ status: 'drafted', draftId: 'draft' }) })
  controller.use({ name: 'rewrite', setup(plugin) {
    plugin.onSpeechInput((input) => {
      input.subscribe({ transcript: 'raw', scope: { kind: 'segment', neighbors: 0 }, scheduling: 'latest' }, async (ctx) => {
        const first = ctx.snapshot.transcript.segments[0]
        if (first?.text === 'Air listens. ')
          ctx.patch({ edits: [{ segmentId: first.id, range: { kind: 'tokens', start: 0, end: 1 }, expectedText: 'Air', replacement: 'AIRI' }], evidenceIds: [] })
      })
    })
  } }, { grants: ['transcript-patch'] })
  const input = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
  frames.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
  events.write({ type: 'transcript.text.delta', delta: 'Air listens. ' })
  await expect.poll(() => input.input?.transcript.corrected.text).toBe('AIRI listens. ')
  events.write({ type: 'transcript.text.delta', delta: 'Another sentence.' })
  await expect.poll(() => input.input?.transcript.corrected.text).toBe('AIRI listens. Another sentence.')
  expect(input.input?.transcript.patchHistory.filter(patch => patch.active)).toHaveLength(1)
  void input.end()
  events.close()
  final.resolve('Air listens. Another sentence.')
  expect((await input.done).status).toBe('drafted')
  await controller.close()
})

it('aborts all provider outputs when standalone transcription fails', async () => {
  const final = Promise.withResolvers<string>()
  const releasedEvents = vi.fn()
  const releasedText = vi.fn()
  let providerSignal: AbortSignal | undefined
  const transcriber = createHearingTranscriber(async (_audio, signal) => {
    providerSignal = signal
    return { mode: 'stream', fullStream: new ReadableStream({ cancel: releasedEvents }), text: final.promise, textStream: new ReadableStream({ cancel: releasedText }) }
  })
  const reader = transcriber.transcribe({ audio: new ReadableStream<PcmBlock>(), signal: new AbortController().signal }).getReader()
  const read = reader.read()
  final.reject(new Error('Provider disconnected'))
  await expect(read).rejects.toThrow('Provider disconnected')
  expect(providerSignal?.aborted).toBe(true)
  await expect.poll(() => releasedText).toHaveBeenCalledOnce()
  expect(releasedEvents).toHaveBeenCalledOnce()
})
