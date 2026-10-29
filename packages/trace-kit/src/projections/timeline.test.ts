import { describe, expect, it } from 'vitest'

import { createFloorTransferProjection, voiceProfile } from '../profiles/voice'
import { createRecordStamper } from '../testing'
import { createAttributeMetricsProjection, summarizeMetric } from './metrics'
import { TraceReader } from './reader'
import { createTimelineProjection } from './timeline'

describe('timeline projection', () => {
  it('merges begin, update, and end of a span', () => {
    const record = createRecordStamper()
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    reader.handleRecords([
      record({ type: 'span.begin', ts: 10, track: 'agents/airi/llm', spanId: 's', name: 'chat', attrs: { a: 1 } }),
      record({ type: 'span.update', ts: 20, track: 'agents/airi/llm', spanId: 's', attrs: { b: 2 } }),
      record({ type: 'instant', ts: 25, track: 'agents/airi/llm', spanId: 's', name: 'llm.first_chunk' }),
      record({ type: 'span.end', ts: 40, track: 'agents/airi/llm', spanId: 's', status: 'ok', attrs: { c: 3 } }),
    ])

    const span = reader.view(timeline).spans.get('window:main/e1/s')!
    expect(span.attrs).toEqual({ a: 1, b: 2, c: 3 })
    expect(span.start).toBe(10)
    expect(span.end).toBe(40)
    expect(span.instants.map(instant => instant.name)).toEqual(['llm.first_chunk'])
  })

  it('keeps the items and attributes of each span apart, with shared empty values', () => {
    const record = createRecordStamper()
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    const begin = record({ type: 'span.begin', ts: 0, track: 'agents/airi/llm', spanId: 'a', name: 'chat', links: [{ rel: 'caused-by', to: { spanId: 'x' } }] })
    reader.handleRecords([
      begin,
      record({ type: 'span.begin', ts: 0, track: 'agents/airi/tools', spanId: 'b', name: 'tool' }),
      record({ type: 'instant', ts: 5, track: 'agents/airi/llm', spanId: 'a', name: 'llm.first_chunk' }),
      record({ type: 'span.end', ts: 10, track: 'agents/airi/llm', spanId: 'a', status: 'ok', links: [{ rel: 'follows-from', to: { spanId: 'y' } }] }),
      record({ type: 'span.end', ts: 10, track: 'agents/airi/tools', spanId: 'b', status: 'ok', attrs: { ok: true } }),
    ])

    const { spans } = reader.view(timeline)
    const a = spans.get('window:main/e1/a')!
    const b = spans.get('window:main/e1/b')!
    // An item added to one span must not reach the other, which still shares the empty lists.
    expect(a.instants).toHaveLength(1)
    expect(b.instants).toHaveLength(0)
    expect(b.instants).toBe(b.annotations)
    expect(a.links.map(link => link.rel)).toEqual(['caused-by', 'follows-from'])
    expect(b.links).toHaveLength(0)
    // A later link copies the list, so the record keeps its own links.
    expect(begin.type === 'span.begin' && begin.links).toHaveLength(1)
    expect(b.attrs).toEqual({ ok: true })
    expect(a.attrs).toEqual({})
  })

  it('marks an end without its begin as start missing', () => {
    const record = createRecordStamper()
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    reader.handleRecords([
      record({ type: 'instant', ts: 5, track: 't', name: 'first' }),
      record({ type: 'span.end', ts: 30, track: 't', spanId: 'lost', status: 'ok' }),
    ])

    const span = reader.view(timeline).spans.get('window:main/e1/lost')!
    expect(span.startMissing).toBe(true)
    expect(span.start).toBe(5)
  })

  it('abandons the open spans of a lost source', () => {
    const record = createRecordStamper()
    const collectorRecord = createRecordStamper({ source: 'collector', epoch: 'c1' })
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    reader.handleRecords([
      record({ type: 'source.started', ts: 0, format: 1, runtime: 'test', profiles: [] }),
      record({ type: 'span.begin', ts: 1, track: 't', spanId: 's', name: 'open' }),
      collectorRecord({ type: 'source.lost', ts: 9, of: { source: 'window:main', epoch: 'e1', lastSeq: 1 }, reason: 'ipc-closed' }),
    ])

    const view = reader.view(timeline)
    expect(view.spans.get('window:main/e1/s')!.abandoned).toBe(true)
    expect(view.markers).toEqual([{ kind: 'source-lost', time: 9, label: 'window:main: ipc-closed' }])
  })

  it('gives overlapping spans of one depth separate lanes', () => {
    const record = createRecordStamper()
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    reader.handleRecords([
      record({ type: 'span.begin', ts: 0, track: 't', spanId: 'a', name: 'a' }),
      record({ type: 'span.begin', ts: 5, track: 't', spanId: 'b', name: 'b' }),
      record({ type: 'span.end', ts: 10, track: 't', spanId: 'a', status: 'ok' }),
      record({ type: 'span.begin', ts: 12, track: 't', spanId: 'c', name: 'c' }),
    ])

    const lanes = reader.view(timeline).tracks.get('t')!.spans.map(span => [span.spanId, span.lane])
    expect(lanes).toEqual([['a', 0], ['b', 1], ['c', 0]])
  })

  it('moves an effect after its cause when the converted time is earlier', () => {
    const record = createRecordStamper()
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    reader.handleRecords([
      record({ type: 'span.begin', ts: 50, track: 'a', spanId: 'cause', name: 'cause' }),
      record({ type: 'instant', ts: 40, track: 'b', name: 'effect', links: [{ rel: 'caused-by', to: { spanId: 'cause' } }] }),
    ])

    const instant = reader.view(timeline).tracks.get('b')!.instants[0]!
    expect(instant.time).toBe(50)
    expect(instant.reordered).toBe(true)
  })

  it('keeps the latest state by time when a backdated state arrives', () => {
    const record = createRecordStamper()
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    reader.handleRecords([
      record({ type: 'state', ts: 20, track: 'participants/user/state', value: 'speaking' }),
      record({ type: 'state', ts: 10, track: 'participants/user/state', value: 'listening' }),
    ])

    const states = reader.view(timeline).tracks.get('participants/user/state')!.states.map(change => change.value)
    expect(states).toEqual(['listening', 'speaking'])
  })

  it('matches tracks against the announced definitions', () => {
    const record = createRecordStamper()
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    reader.handleRecords([
      record({ type: 'span.begin', ts: 0, track: 'participants/user/speech', spanId: 's', name: 'speech' }),
      record({ type: 'definition', ts: 1, kind: 'track', key: 'participants/{actor}/speech', data: voiceProfile.tracks!.find(track => track.path === 'participants/{actor}/speech') }),
    ])

    const track = reader.view(timeline).tracks.get('participants/user/speech')!
    expect(track.definition?.group).toBe('participants')
    expect(track.params).toEqual({ actor: 'user' })
  })
})

describe('metrics', () => {
  it('collects attribute metrics and leaves out failed measurements', () => {
    const record = createRecordStamper()
    const metrics = createAttributeMetricsProjection()
    const reader = new TraceReader([metrics])
    reader.handleRecords([
      record({ type: 'definition', ts: 0, kind: 'metric', key: 'llm.ttft_ms', data: { key: 'llm.ttft_ms', value: { kind: 'attribute', track: 'agents/{agent}/llm', record: 'span.end', attribute: 'llm.ttft_ms' } } }),
      record({ type: 'span.end', ts: 1, track: 'agents/airi/llm', spanId: 'a', status: 'ok', attrs: { 'llm.ttft_ms': 300 } }),
      record({ type: 'span.end', ts: 2, track: 'agents/airi/llm', spanId: 'b', status: 'error', attrs: { 'llm.ttft_ms': 900 } }),
    ])

    const summary = summarizeMetric('llm.ttft_ms', reader.view(metrics)['llm.ttft_ms']!)
    expect(summary.values.p50).toBe(300)
    expect(summary.values.p95).toBeUndefined()
    expect(summary.excluded.failed).toBe(1)
  })

  it('derives floor transfers between participants', () => {
    const record = createRecordStamper()
    const floor = createFloorTransferProjection()
    const reader = new TraceReader([floor])
    reader.handleRecords([
      record({ type: 'span.begin', ts: 0, track: 'participants/user/speech', spanId: 'u1', name: 'speech' }),
      record({ type: 'span.end', ts: 1000, track: 'participants/user/speech', spanId: 'u1', status: 'ok' }),
      record({ type: 'span.begin', ts: 1800, track: 'participants/airi/playback', spanId: 'p1', name: 'playback' }),
      record({ type: 'span.end', ts: 2500, track: 'participants/airi/playback', spanId: 'p1', status: 'ok' }),
      // A second segment of the same reply is not a transfer.
      record({ type: 'span.begin', ts: 2600, track: 'participants/airi/playback', spanId: 'p2', name: 'playback' }),
      record({ type: 'span.end', ts: 3000, track: 'participants/airi/playback', spanId: 'p2', status: 'ok' }),
      // The user starts before the agent finished: an overlap, not a transfer.
      record({ type: 'span.begin', ts: 2900, track: 'participants/user/speech', spanId: 'u2', name: 'speech' }),
    ])

    const samples = reader.view(floor)
    expect(samples['voice.response_latency']).toEqual([{ time: 1800, value: 800, dimensions: { from: 'user', to: 'airi' } }])
  })
})
