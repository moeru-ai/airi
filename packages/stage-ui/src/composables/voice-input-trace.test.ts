import type { SpeechInputAttemptOutcome } from '@proj-airi/core-agent'
import type { TraceRecord } from '@proj-airi/trace-kit'

import { beginSpan } from '@proj-airi/trace-kit'
import { createTimelineProjection, TraceReader } from '@proj-airi/trace-kit/projections'
import { VoiceAttributes, VoiceIdKeys, VoiceNames, VoiceSeries } from '@proj-airi/trace-kit/voice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeVoiceInput, configureTraceTransport, getTraceSink, getTraceSource, runInTraceSpan } from './use-trace'
import { createVoiceInputTracer } from './voice-input-trace'

const records: TraceRecord[] = []
let stopTransport: (() => void) | undefined

beforeEach(() => {
  stopTransport = configureTraceTransport({ source: 'test', clock: 'mono:test', runtime: 'test', send: record => records.push(record) })
})

afterEach(() => {
  stopTransport?.()
  records.length = 0
})

function spansNamed(name: string) {
  const timeline = createTimelineProjection()
  const reader = new TraceReader([timeline], 'mono:test')
  reader.handleRecords(records)
  return [...reader.view(timeline).spans.values()].filter(span => span.name === name)
}

function endedInputs() {
  return spansNamed(VoiceNames.VoiceInput).filter(span => span.end !== undefined)
}

/** An input whose outcome the test settles. Only the ID, the session, and the outcome reach the tracer. */
function attempt(id: string) {
  const done = Promise.withResolvers<SpeechInputAttemptOutcome>()
  return { id, sessionId: 'alice', done: done.promise, settle: done.resolve }
}

describe('createVoiceInputTracer', () => {
  it('traces an input from start to outcome and exposes it as the active input while it runs', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-1')

    tracer.start(input, 'speech')
    expect(activeVoiceInput.value).toEqual({ inputId: 'input-1', sessionId: 'alice' })
    input.settle({ status: 'committed', messageId: 'input-1' })

    await vi.waitFor(() => expect(endedInputs()).toHaveLength(1))
    const span = endedInputs()[0]!
    expect(span.track).toBe('participants/user/input')
    expect(span.ids?.[VoiceIdKeys.Input]).toBe('input-1')
    expect(span.ids?.[VoiceIdKeys.Conversation]).toBe('alice')
    expect(span.attrs[VoiceAttributes.InputTrigger]).toBe('speech')
    expect(span.attrs[VoiceAttributes.InputOutcome]).toBe('committed')
    expect(activeVoiceInput.value).toBeUndefined()
  })

  it('writes the level and the VAD probability of each window to the input track', async () => {
    // A viewer shows every track, so the writer keeps its samples.
    getTraceSource().setWanted('*')
    const tracer = createVoiceInputTracer()
    const input = attempt('input-1')

    tracer.start(input, 'speech')
    tracer.window([new Float32Array([0.5, -0.5])], 0.9)
    tracer.window([new Float32Array([0, 0])], 0.1)
    input.settle({ status: 'committed', messageId: 'input-1' })

    await vi.waitFor(() => expect(records.some(record => record.type === 'sample.chunk')).toBe(true))
    const chunks = records.filter(record => record.type === 'sample.chunk')
    expect(chunks.map(chunk => chunk.track)).toEqual(['participants/user/input'])
    expect(Object.keys(chunks[0]!.values).sort()).toEqual([VoiceSeries.Level, VoiceSeries.Probability].sort())
    expect(chunks[0]!.values[VoiceSeries.Probability]).toEqual([expect.closeTo(0.9), expect.closeTo(0.1)])
  })

  it('links the input to the wake that started it', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-2')

    tracer.start(input, 'wake-word', 'wake-span')
    input.settle({ status: 'cancelled', reason: 'Speech segment was too short' })

    await vi.waitFor(() => expect(endedInputs()).toHaveLength(1))
    const span = endedInputs()[0]!
    expect(span.links).toContainEqual({ rel: 'caused-by', to: { spanId: 'wake-span' } })
    expect(span.status).toBe('cancelled')
    expect(span.reason).toBe('Speech segment was too short')
  })

  it('links an input that merged into an earlier draft to the input of that draft', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-3')

    tracer.start(input, 'control')
    input.settle({ status: 'drafted', draftId: 'earlier-draft' })

    await vi.waitFor(() => expect(endedInputs()).toHaveLength(1))
    expect(endedInputs()[0]!.links).toContainEqual({ rel: 'same-entity', to: { key: VoiceIdKeys.Input, id: 'earlier-draft' } })
  })

  it('records one speech span for each speech segment, and closes an open segment with the input', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-4')
    tracer.start(input, 'speech')
    const window = (speech: boolean) => tracer.activity({ inputId: 'input-4', speech, durationMs: 100 })

    // A short breath stays in one segment. A 300 ms pause closes it.
    window(true)
    window(true)
    window(false)
    window(true)
    window(false)
    window(false)
    window(false)
    window(true)
    input.settle({ status: 'committed', messageId: 'input-4' })

    await vi.waitFor(() => expect(endedInputs()).toHaveLength(1))
    const segments = spansNamed(VoiceNames.SpeechSegment)
    expect(segments.map(segment => segment.attrs[VoiceAttributes.SpeechDurationMs])).toEqual([300, 100])
    expect(segments.every(segment => segment.ids?.[VoiceIdKeys.Input] === 'input-4')).toBe(true)
  })

  it('ends a failed input with an error', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-5')

    tracer.start(input, 'speech')
    input.settle({ status: 'failed', stage: 'transcription', error: new Error('provider down') })

    await vi.waitFor(() => expect(endedInputs()).toHaveLength(1))
    const span = endedInputs()[0]!
    expect(span.status).toBe('error')
    expect(span.message).toBe('provider down')
    expect(span.reason).toBe('transcription')
  })

  it('records the newest speaker score of an input and counts the rejected updates', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-6')
    const range = { sourceId: 'mic', startFrame: 0, endFrame: 16000 }

    tracer.start(input, 'speech')
    tracer.speakerEvidence({ inputId: 'input-6', range, value: { candidates: [{ speakerId: 'owner', score: 0.61234 }], voicedMs: 900.4 }, scores: [0.61234] }, { status: 'applied' })
    // The transcription has ended, so the input rejects the update. The trace still shows the complete score.
    tracer.speakerEvidence({ inputId: 'input-6', range, value: { candidates: [{ speakerId: 'owner', score: 0.55 }], voicedMs: 1500 }, scores: [0.61234, 0.48766] }, { status: 'rejected', reason: 'closed' })
    input.settle({ status: 'committed', messageId: 'input-6' })

    await vi.waitFor(() => expect(endedInputs()).toHaveLength(1))
    const span = endedInputs()[0]!
    expect(span.attrs[VoiceAttributes.SpeakerScore]).toBe(0.55)
    expect(span.attrs[VoiceAttributes.SpeakerScores]).toEqual([0.612, 0.488])
    expect(span.attrs[VoiceAttributes.SpeakerVoicedMs]).toBe(1500)
    expect(span.attrs[VoiceAttributes.SpeakerRejectedCount]).toBe(1)
  })

  it('adds no speaker attributes to an input without speaker evidence', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-7')

    tracer.start(input, 'control')
    input.settle({ status: 'committed', messageId: 'input-7' })

    await vi.waitFor(() => expect(endedInputs()).toHaveLength(1))
    expect(endedInputs()[0]!.attrs[VoiceAttributes.SpeakerScore]).toBeUndefined()
  })
})

describe('runInTraceSpan', () => {
  it('ends the span with the result, an error status, or a cancellation', async () => {
    const sink = getTraceSink()
    const ok = beginSpan(sink, { track: 't', name: 'ok' })
    const failed = beginSpan(sink, { track: 't', name: 'failed' })
    const cancelled = beginSpan(sink, { track: 't', name: 'cancelled' })
    const abort = new AbortController()

    await expect(runInTraceSpan(ok, abort.signal, async () => 'done')).resolves.toBe('done')
    await expect(runInTraceSpan(failed, abort.signal, async () => {
      throw new Error('model unavailable')
    })).rejects.toThrow('model unavailable')
    abort.abort('Speech evidence changed')
    await expect(runInTraceSpan(cancelled, abort.signal, async () => {
      throw abort.signal.reason
    })).rejects.toBe('Speech evidence changed')

    expect(spansNamed('ok')[0]!.status).toBe('ok')
    expect(spansNamed('failed')[0]!.status).toBe('error')
    expect(spansNamed('failed')[0]!.message).toBe('model unavailable')
    expect(spansNamed('cancelled')[0]!.status).toBe('cancelled')
  })
})
