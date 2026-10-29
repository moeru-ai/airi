import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { describe, expect, it } from 'vitest'

import { uniqueSpans } from './spans'

function span(traceId: string, spanId: string, name = 'tts.synthesis'): SerializedIOSpan {
  return { traceId, spanId, parentSpanId: '', name, kind: 0, startTimeNano: '0', endTimeNano: '1', attributes: {}, events: [], status: { code: 0, message: '' }, ended: true }
}

describe('uniqueSpans', () => {
  it('keeps each span of two windows one time, in the order of first appearance', () => {
    const runtime = [span('t1', 's1'), span('t1', 's2')]
    // The interaction window heard the same spans on the trace channel, and one more.
    const interaction = [span('t1', 's1'), span('t1', 's2'), span('t1', 's3')]

    expect(uniqueSpans(runtime, interaction).map(item => item.spanId)).toEqual(['s1', 's2', 's3'])
  })

  it('keeps spans with the same span ID in different traces', () => {
    expect(uniqueSpans([span('t1', 's1')], [span('t2', 's1')])).toHaveLength(2)
  })
})
