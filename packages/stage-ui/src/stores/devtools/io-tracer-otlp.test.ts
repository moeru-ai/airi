import type { ReadableSpan } from '../../composables/use-io-tracer'

import { IOSpanNames } from '@proj-airi/stage-shared'
import { afterEach, describe, expect, it } from 'vitest'

import { startSpan, subscribeIOSpan } from '../../composables/use-io-tracer'
import { toOTLPTrace } from './io-tracer-otlp'

describe('toOTLPTrace', () => {
  let unsubscribe: (() => void) | undefined

  afterEach(() => {
    unsubscribe?.()
  })

  function endSpan(): ReadableSpan {
    const spans: ReadableSpan[] = []
    unsubscribe = subscribeIOSpan(span => spans.push(span))
    startSpan(IOSpanNames.LLMInference).end()
    return spans[0]!
  }

  it('exports an internal span as OTLP SPAN_KIND_INTERNAL', () => {
    const otlp = toOTLPTrace([endSpan()])

    // OTLP SPAN_KIND_INTERNAL is 1. OTel JS SpanKind.INTERNAL is 0, which OTLP reads as SPAN_KIND_UNSPECIFIED.
    expect(otlp.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.kind).toBe(1)
  })

  it('names the scope after the tracer that created the spans', () => {
    const otlp = toOTLPTrace([endSpan()])

    expect(otlp.resourceSpans[0]!.scopeSpans[0]!.scope.name).toBe('ai.moeru.airi.io-tracer')
  })
})
