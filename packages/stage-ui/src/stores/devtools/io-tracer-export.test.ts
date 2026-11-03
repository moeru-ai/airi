import type { TraceRecord } from '@proj-airi/trace-kit'

import { MAX_CHUNK_POINTS, traceRecordSchema } from '@proj-airi/trace-kit'
import { createRecordStamper } from '@proj-airi/trace-kit/testing'
import { createTraceViewReader } from '@proj-airi/trace-kit/views'
import { describe, expect, it } from 'vitest'

import * as v from 'valibot'

import { seriesAsSampleChunks } from './io-tracer-export'

const TRACE_CLOCK = 'mono:collector'

function levelRecords(count: number): TraceRecord[] {
  const stamp = createRecordStamper({ source: 'window:main', clock: TRACE_CLOCK })
  const offsetsMs = Array.from({ length: count }, (_, index) => index * 10)
  const level = offsetsMs.map((_, index) => (index % 7) / 7)
  return [stamp({ type: 'sample.chunk', ts: 1000, track: 'participants/user/input', offsetsMs, values: { level } })]
}

describe('seriesAsSampleChunks', () => {
  it('saves the series so that a replay of the file draws the same points', () => {
    const live = createTraceViewReader(TRACE_CLOCK, { seriesRetention: false })
    live.reader.handleRecords(levelRecords(MAX_CHUNK_POINTS + 10))
    const saved = live.timelineView().tracks.get('participants/user/input')!.series.level!

    const chunks = seriesAsSampleChunks(live.timelineView().tracks.values(), TRACE_CLOCK, 'e1')
    // A file goes through the untrusted ingest again, so each chunk must stay valid and small.
    expect(chunks).toHaveLength(2)
    for (const chunk of chunks)
      expect(v.safeParse(traceRecordSchema, JSON.parse(JSON.stringify(chunk))).success).toBe(true)

    const replay = createTraceViewReader(TRACE_CLOCK, { seriesRetention: false })
    replay.reader.handleRecords(chunks)
    const replayed = replay.timelineView().tracks.get('participants/user/input')!.series.level!
    expect(Array.from(replayed.times)).toEqual(Array.from(saved.times))
    expect(Array.from(replayed.values)).toEqual(Array.from(saved.values))
  })

  it('writes nothing for a trace without series', () => {
    expect(seriesAsSampleChunks([], TRACE_CLOCK, 'e1')).toEqual([])
  })
})
