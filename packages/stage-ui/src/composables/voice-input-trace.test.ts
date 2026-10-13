import type { SpeechInputAttemptOutcome } from '@proj-airi/core-agent'

import type { ReadableSpan } from './use-io-tracer'

import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { activeVoiceInputSpan, onIOSpan, runInSpan, startSpan, takeComposerVoiceParent, takeVoiceTurnParent } from './use-io-tracer'
import { createVoiceInputTracer } from './voice-input-trace'

const spans: ReadableSpan[] = []
onIOSpan(span => spans.push(span))

afterEach(() => {
  spans.length = 0
})

function spansNamed(name: string) {
  return spans.filter(span => span.name === name)
}

/** An input whose outcome the test settles. Only the ID and the outcome reach the tracer. */
function attempt(id: string) {
  const done = Promise.withResolvers<SpeechInputAttemptOutcome>()
  return { id, done: done.promise, settle: done.resolve }
}

describe('createVoiceInputTracer', () => {
  it('traces an input from start to outcome and makes it the parent of its recognition', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-1')

    tracer.start(input, 'speech')
    const recognition = startSpan(IOSpanNames.SpeechRecognition, activeVoiceInputSpan.value)
    recognition.end()
    input.settle({ status: 'committed', messageId: 'input-1' })

    await vi.waitFor(() => expect(spansNamed(IOSpanNames.VoiceInput)).toHaveLength(1))
    const span = spansNamed(IOSpanNames.VoiceInput)[0]!
    expect(span.attributes[IOAttributes.VoiceInputTrigger]).toBe('speech')
    expect(span.attributes[IOAttributes.VoiceInputOutcome]).toBe('committed')
    expect(spansNamed(IOSpanNames.SpeechRecognition)[0]!.parentSpanContext?.spanId).toBe(span.spanContext().spanId)
    expect(activeVoiceInputSpan.value).toBeUndefined()
  })

  it('continues the trace of the wake that started the input', async () => {
    const tracer = createVoiceInputTracer()
    const wake = startSpan(IOSpanNames.WakeWord)
    wake.end()
    const input = attempt('input-2')

    tracer.start(input, 'wake-word', wake)
    input.settle({ status: 'cancelled', reason: 'Speech segment was too short' })

    await vi.waitFor(() => expect(spansNamed(IOSpanNames.VoiceInput)).toHaveLength(1))
    const span = spansNamed(IOSpanNames.VoiceInput)[0]!
    expect(span.spanContext().traceId).toBe(wake.spanContext().traceId)
    expect(span.parentSpanContext?.spanId).toBe(wake.spanContext().spanId)
    expect(span.attributes[IOAttributes.VoiceInputReason]).toBe('Speech segment was too short')
  })

  it('links the chat turn of the submission, and of a draft that the input merged into', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-3')

    tracer.start(input, 'control')
    const span = activeVoiceInputSpan.value
    input.settle({ status: 'drafted', draftId: 'earlier-draft' })
    await vi.waitFor(() => expect(spansNamed(IOSpanNames.VoiceInput)).toHaveLength(1))

    expect(takeVoiceTurnParent('input-3')).toBe(span)
    expect(takeVoiceTurnParent('earlier-draft')).toBe(span)
    // A turn takes its parent once.
    expect(takeVoiceTurnParent('earlier-draft')).toBeUndefined()
  })

  // Codex review on PR #2939: the composer sends dictated text under a new message ID, so the input ID never matches.
  it('links a composer dictation to the next turn of its session, once and only for a short time', async () => {
    const tracer = createVoiceInputTracer()
    const first = attempt('dictation-1')
    tracer.start(first, 'control')
    const span = activeVoiceInputSpan.value
    tracer.markComposer('dictation-1', 'alice')
    first.settle({ status: 'drafted', draftId: 'dictation-1' })
    await vi.waitFor(() => expect(spansNamed(IOSpanNames.VoiceInput)).toHaveLength(1))

    expect(takeComposerVoiceParent('bob')).toBeUndefined()
    expect(takeComposerVoiceParent('alice')).toBe(span)
    expect(takeComposerVoiceParent('alice')).toBeUndefined()

    vi.useFakeTimers()
    try {
      const second = attempt('dictation-2')
      tracer.start(second, 'control')
      tracer.markComposer('dictation-2', 'alice')
      second.settle({ status: 'drafted', draftId: 'dictation-2' })
      await vi.waitFor(() => expect(spansNamed(IOSpanNames.VoiceInput)).toHaveLength(2))
      vi.advanceTimersByTime(61_000)

      expect(takeComposerVoiceParent('alice')).toBeUndefined()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('records one VAD span for each speech segment, and closes an open segment with the input', async () => {
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

    await vi.waitFor(() => expect(spansNamed(IOSpanNames.VoiceInput)).toHaveLength(1))
    const segments = spansNamed(IOSpanNames.VoiceActivityDetection)
    expect(segments.map(segment => segment.attributes[IOAttributes.VADAudioDurationMs])).toEqual([300, 100])
    expect(segments.every(segment => segment.parentSpanContext?.spanId === spansNamed(IOSpanNames.VoiceInput)[0]!.spanContext().spanId)).toBe(true)
  })

  it('marks a failed input as an error', async () => {
    const tracer = createVoiceInputTracer()
    const input = attempt('input-5')

    tracer.start(input, 'speech')
    input.settle({ status: 'failed', stage: 'transcription', error: new Error('provider down') })

    await vi.waitFor(() => expect(spansNamed(IOSpanNames.VoiceInput)).toHaveLength(1))
    const span = spansNamed(IOSpanNames.VoiceInput)[0]!
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'provider down' })
    expect(span.attributes[IOAttributes.VoiceInputReason]).toBe('transcription')
  })
})

describe('runInSpan', () => {
  it('ends the span with the result, an error status, or a cancellation', async () => {
    const ok = startSpan('ok')
    const failed = startSpan('failed')
    const cancelled = startSpan('cancelled')
    const abort = new AbortController()

    await expect(runInSpan(ok, abort.signal, async () => 'done')).resolves.toBe('done')
    await expect(runInSpan(failed, abort.signal, async () => {
      throw new Error('model unavailable')
    })).rejects.toThrow('model unavailable')
    abort.abort('Speech evidence changed')
    await expect(runInSpan(cancelled, abort.signal, async () => {
      throw abort.signal.reason
    })).rejects.toBe('Speech evidence changed')

    await vi.waitFor(() => expect(spans).toHaveLength(3))
    expect(spansNamed('ok')[0]!.status.code).toBe(SpanStatusCode.UNSET)
    expect(spansNamed('failed')[0]!.status).toEqual({ code: SpanStatusCode.ERROR, message: 'model unavailable' })
    expect(spansNamed('cancelled')[0]!.status.code).toBe(SpanStatusCode.UNSET)
    expect(spansNamed('cancelled')[0]!.attributes[IOAttributes.Cancelled]).toBe(true)
  })
})
