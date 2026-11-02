import type { SpeechOutput } from '@proj-airi/core-agent'
import type { TtsRequest } from '@proj-airi/pipelines-audio'
import type { TraceRecord } from '@proj-airi/trace-kit'

import { Playback } from '@proj-airi/pipelines-audio'
import { createTimelineProjection, TraceReader } from '@proj-airi/trace-kit/projections'
import { VoiceAttributes, VoiceIdKeys, VoiceNames } from '@proj-airi/trace-kit/voice'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { traceSpeechOutput } from './speech-output-trace'
import { configureTraceTransport, getTraceSource } from './use-trace'

const records: TraceRecord[] = []
let stopTransport: (() => void) | undefined

beforeEach(() => {
  stopTransport = configureTraceTransport({ source: 'test', clock: 'mono:test', runtime: 'test', send: record => records.push(record) })
})

afterEach(() => {
  stopTransport?.()
  records.length = 0
})

/** Decoded audio of `seconds` at 8 kHz: a tone with an amplitude of 0.5. */
function decoded(seconds: number) {
  const samples = new Float32Array(Math.round(seconds * 8000)).map((_, index) => Math.sin(index / 4) * 0.5)
  return { duration: seconds, numberOfChannels: 1, sampleRate: 8000, getChannelData: () => samples }
}

function request(text: string): TtsRequest {
  return { turnId: 'reply', streamId: 'stream', intentId: 'intent', segmentId: 'segment-1', sequence: 0, text, special: null, reason: 'hard', priority: 0, createdAt: 0 }
}

function spans() {
  const timeline = createTimelineProjection()
  const reader = new TraceReader([timeline], 'mono:test')
  reader.handleRecords(records)
  return [...reader.view(timeline).spans.values()]
}

function spanNamed(name: string) {
  return spans().find(span => span.name === name)
}

it('records synthesis, playback, and output spans with the fields that timelines join', async () => {
  const started = vi.fn()
  const ended = vi.fn()
  const output: SpeechOutput = {
    playback: new Playback({ nowMs: () => 0, play: vi.fn() }),
    synthesize: async () => new Blob(['speech']),
    onPlaybackStart: started,
    onPlaybackEnd: ended,
  }
  const trace = traceSpeechOutput({ sessionId: 'alice', turnId: 'reply' }, 'agent', output, async () => decoded(0.5))
  if (!('synthesize' in trace.output))
    throw new Error('Expected pipeline synthesis')

  await trace.output.synthesize(request('Hello.'), new AbortController().signal)
  await vi.waitFor(() => expect(spanNamed(VoiceNames.TTSRequest)?.end).toBeDefined())
  const clip = { id: 'segment-1', text: 'Hello.' }
  trace.output.onPlaybackStart?.(clip)
  trace.output.onPlaybackEnd?.(clip, { status: 'stopped', reason: 'speech-input' })
  trace.end()

  const synthesis = spanNamed(VoiceNames.TTSRequest)!
  expect(synthesis.track).toBe('participants/agent/tts')
  expect(synthesis.ids?.[VoiceIdKeys.Turn]).toBe('reply')
  expect(synthesis.ids?.[VoiceIdKeys.Conversation]).toBe('alice')
  expect(synthesis.ids?.[VoiceIdKeys.Segment]).toBe('segment-1')
  expect(synthesis.attrs[VoiceAttributes.TTSText]).toBe('Hello.')
  expect(synthesis.attrs[VoiceAttributes.TTSChunkReason]).toBe('hard')
  expect(synthesis.attrs[VoiceAttributes.TTSAudioDurationMs]).toBe(500)
  const playback = spanNamed(VoiceNames.Playback)!
  expect(playback.ids?.[VoiceIdKeys.Segment]).toBe('segment-1')
  expect(playback.status).toBe('cancelled')
  expect(playback.reason).toBe('speech-input')
  expect(spanNamed(VoiceNames.SpeechOutput)?.ids?.[VoiceIdKeys.Turn]).toBe('reply')
  expect(started).toHaveBeenCalledWith(clip)
  expect(ended).toHaveBeenCalledWith(clip, { status: 'stopped', reason: 'speech-input' })
})

it('ends synthesis that is still running when the turn ends as cancelled', async () => {
  const pending = Promise.withResolvers<Blob | null>()
  const trace = traceSpeechOutput({ sessionId: 'alice', turnId: 'reply' }, 'agent', {
    playback: new Playback({ nowMs: () => 0, play: vi.fn() }),
    synthesize: () => pending.promise,
  }, async () => decoded(0))
  if (!('synthesize' in trace.output))
    throw new Error('Expected pipeline synthesis')

  const synthesizing = trace.output.synthesize(request('Late.'), new AbortController().signal)
  trace.end()
  pending.resolve(null)
  await synthesizing

  expect(records.filter(record => record.type === 'span.end' && record.track === 'participants/agent/tts')).toHaveLength(1)
  expect(spanNamed(VoiceNames.TTSRequest)?.status).toBe('cancelled')
})

it('marks synthesis without audio and without an abort as no audio, not cancelled', async () => {
  const trace = traceSpeechOutput({ sessionId: 'alice', turnId: 'reply' }, 'agent', {
    playback: new Playback({ nowMs: () => 0, play: vi.fn() }),
    synthesize: async () => null,
  }, async () => decoded(0))
  if (!('synthesize' in trace.output))
    throw new Error('Expected pipeline synthesis')

  await trace.output.synthesize(request('Muted.'), new AbortController().signal)
  trace.end()

  const synthesis = spanNamed(VoiceNames.TTSRequest)!
  expect(synthesis.status).toBe('ok')
  expect(synthesis.reason).toBe('no-audio')
})

it('marks synthesis that returns no audio after an abort as cancelled', async () => {
  const trace = traceSpeechOutput({ sessionId: 'alice', turnId: 'reply' }, 'agent', {
    playback: new Playback({ nowMs: () => 0, play: vi.fn() }),
    synthesize: async () => null,
  }, async () => decoded(0))
  if (!('synthesize' in trace.output))
    throw new Error('Expected pipeline synthesis')

  const abort = new AbortController()
  abort.abort()
  await trace.output.synthesize(request('Stopped.'), abort.signal)
  trace.end()

  const synthesis = spanNamed(VoiceNames.TTSRequest)!
  expect(synthesis.status).toBe('cancelled')
  expect(synthesis.reason).toBe('aborted')
})

it('writes the level waveform of a played segment from its playback start', async () => {
  getTraceSource().setWanted('*')
  const output: SpeechOutput = {
    playback: new Playback({ nowMs: () => 0, play: vi.fn() }),
    synthesize: async () => new Blob(['speech']),
  }
  const trace = traceSpeechOutput({ sessionId: 'alice', turnId: 'reply' }, 'agent', output, async () => decoded(0.4))
  if (!('synthesize' in trace.output))
    throw new Error('Expected pipeline synthesis')

  await trace.output.synthesize(request('Hello.'), new AbortController().signal)
  await vi.waitFor(() => expect(spanNamed(VoiceNames.TTSRequest)?.end).toBeDefined())
  const clip = { id: 'segment-1', text: 'Hello.' }
  trace.output.onPlaybackStart?.(clip)
  await new Promise(resolve => setTimeout(resolve, 120))
  trace.output.onPlaybackEnd?.(clip, { status: 'stopped', reason: 'speech-input' })
  trace.end()

  const chunks = records.filter(record => record.type === 'sample.chunk' && record.track === 'participants/agent/playback')
  const levels = chunks.flatMap(record => record.type === 'sample.chunk' ? record.values.level ?? [] : [])
  const playback = spanNamed(VoiceNames.Playback)!
  // A stopped segment writes the levels up to its stop: about 120 ms of 25 ms windows, not the whole 400 ms.
  expect(levels.length).toBeGreaterThanOrEqual(4)
  expect(levels.length).toBeLessThan(16)
  // A tone of amplitude 0.5 has an RMS of about -9 dBFS, which is 0.85 on the 60 dB scale.
  expect(levels[0]).toBeCloseTo(0.85, 1)
  expect(chunks[0]!.ts).toBeCloseTo(playback.start, 0)
})
