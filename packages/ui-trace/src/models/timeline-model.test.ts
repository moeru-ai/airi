import type { TraceRecordInput } from '@proj-airi/trace-kit'

import { ROW_GEOMETRY } from '@proj-airi/timeline-canvas'
import { agentProfile } from '@proj-airi/trace-kit/agent'
import { createRecordStamper, readTimeline } from '@proj-airi/trace-kit/testing'
import { createTraceViewReader } from '@proj-airi/trace-kit/views'
import { voiceProfile } from '@proj-airi/trace-kit/voice'
import { describe, expect, it } from 'vitest'

import { detailRowModel, SeriesCache } from './canvas-model'
import { buildEntityLanes } from './entity-lanes'
import { buildRows, rowHeightOf, rowListItems } from './timeline-model'

function timelineOf(inputs: TraceRecordInput[]) {
  return readTimeline(inputs, { profiles: [voiceProfile, agentProfile] })
}

describe('timeline model', () => {
  it('orders rows by group, instance, and track order, with a row for each extra lane', () => {
    const { state } = timelineOf([
      { type: 'span.begin', ts: 0, track: 'agents/agent/llm', spanId: 'l', name: 'chat' },
      { type: 'span.begin', ts: 0, track: 'participants/user/asr', spanId: 'a1', name: 'asr' },
      { type: 'span.begin', ts: 1, track: 'participants/user/asr', spanId: 'a2', name: 'asr' },
      { type: 'span.begin', ts: 0, track: 'participants/user/input', spanId: 'i', name: 'voice-input' },
    ])

    const rows = buildRows(state, { locale: 'en', hideEmpty: true })

    expect(rows.map(row => row.key)).toEqual([
      'participants/user/input#0.0',
      'participants/user/asr#0.0',
      'participants/user/asr#0.1',
      'agents/agent/llm#0.0',
    ])
    expect(rows[0]!.groupLabel).toBe('Participants')
    expect(rows[2]!.primary).toBe(false)
    expect(rows[3]!.groupLabel).toBe('Agents')
  })

  it('labels only the items of tracks that ask for it, and marks failed and retried items', () => {
    const { state } = timelineOf([
      { type: 'span.begin', ts: 0, track: 'participants/user/asr', spanId: 'a1', name: 'asr' },
      { type: 'span.end', ts: 10, track: 'participants/user/asr', spanId: 'a1', status: 'error' },
      { type: 'span.begin', ts: 20, track: 'participants/user/asr', spanId: 'a2', name: 'asr', links: [{ rel: 'retry-of', to: { spanId: 'a1' } }] },
      { type: 'span.end', ts: 30, track: 'participants/user/asr', spanId: 'a2', status: 'ok' },
      { type: 'span.begin', ts: 0, track: 'agents/agent/tools', spanId: 't', name: 'web_search' },
      { type: 'span.end', ts: 5, track: 'agents/agent/tools', spanId: 't', status: 'ok' },
    ])
    const rows = buildRows(state, { locale: 'en', hideEmpty: true })
    const asrRow = rows.find(row => row.key === 'participants/user/asr#0.0')!
    const asrTrackIcon = asrRow.track.definition?.icon
    const asr = detailRowModel(asrRow)
    const tools = detailRowModel(rows.find(row => row.key === 'agents/agent/tools#0.0')!)

    // The track name tells what an ASR span is, so its items carry no label. A tool call names its tool.
    expect(asr.layers[0]!.labels).toBeUndefined()
    expect(tools.layers[0]!.labels).toEqual(['web_search'])
    const asrStyles = asr.layers[0]!.targets.map((_, index) => asr.styles[asr.layers[0]!.column.styles[index]!]!)
    // A failure is a status dot. A retry is an icon. Each span also carries the icon of its track and its duration.
    expect(asrStyles.map(style => style.status)).toEqual(['failed', undefined])
    expect(asrStyles.map(style => style.icon)).toEqual([undefined, 'retry'])
    expect(asrStyles.every(style => style.glyph === asrTrackIcon)).toBe(true)
    expect(asr.layers[0]!.trailing?.every(text => text !== undefined)).toBe(true)
  })

  it('reveals new samples of a live series smoothly, and old samples at once', () => {
    // A live view reads one reader, and its series grows in place.
    const stamp = createRecordStamper()
    const trace = createTraceViewReader('mono:collector', { seriesRetention: false })
    const track = () => trace.timelineView().tracks.get('participants/user/input')!
    trace.reader.handleRecords([stamp({ type: 'sample.chunk', ts: 0, track: 'participants/user/input', offsetsMs: [0, 100], values: { level: [0.5, 0.5] } })])
    const cache = new SeriesCache()
    cache.get(track(), 'level')
    expect(cache.reveal(track(), 'level', 10)).toBe(110)

    trace.reader.handleRecords([stamp({ type: 'sample.chunk', ts: 200, track: 'participants/user/input', offsetsMs: [0, 100], values: { level: [0.5, 0.5] } })])
    const next = track()
    cache.get(next, 'level')
    const first = cache.reveal(next, 'level', 10)
    // The edge moves toward the new target of 310, a part of the way on each frame, and reaches it.
    expect(first).toBeGreaterThan(110)
    expect(first).toBeLessThan(310)
    let edge = first
    for (let frame = 0; frame < 120; frame++)
      edge = cache.reveal(next, 'level', 10)
    expect(edge).toBe(310)
  })

  it('rebuilds the pyramid of a series when its revision changes', () => {
    const records: TraceRecordInput[] = [{ type: 'sample.chunk', ts: 0, track: 'participants/user/input', offsetsMs: [0, 100, 200], values: { level: [0.1, 0.1, 0.1] } }]
    const track = timelineOf(records).state.tracks.get('participants/user/input')!
    const cache = new SeriesCache()
    const peak = () => Math.max(...cache.get(track, 'level').envelope({ start: 0, end: 300, width: 3 }).maxs)
    expect(peak()).toBeCloseTo(0.1)

    // A compaction or a late point changes a point in the middle. The first time and the count stay the same.
    const series = track.series.level!
    track.series.level = { times: series.times, values: Float32Array.from([0.1, 0.9, 0.1]), revision: series.revision + 1 }
    expect(peak()).toBeCloseTo(0.9)
  })

  it('rebuilds the pyramid of a series when a new reader reads the same track', () => {
    const chunk = (level: number): TraceRecordInput => ({ type: 'sample.chunk', ts: 0, track: 'participants/user/input', offsetsMs: [0, 100, 200], values: { level: [0.1, level, 0.1] } })
    const cache = new SeriesCache()
    const peak = (records: TraceRecordInput[]) => Math.max(...cache.get(timelineOf(records).state.tracks.get('participants/user/input')!, 'level').envelope({ start: 0, end: 300, width: 3 }).maxs)
    expect(peak([chunk(0.2)])).toBeCloseTo(0.2)

    // The next trace has the same path, first time, count, and revision, but other values.
    expect(peak([chunk(0.9)])).toBeCloseTo(0.9)
  })

  it('lists the states and the instants that the first row of a track draws, so a keyboard can reach them', () => {
    const { state } = timelineOf([
      { type: 'state', ts: 0, track: 'participants/user/vad', value: 'speaking' },
      { type: 'state', ts: 500, track: 'participants/user/vad', value: 'unknown' },
      { type: 'instant', ts: 200, track: 'participants/user/vad', name: 'vad.peak' },
      { type: 'span.begin', ts: 100, track: 'participants/user/vad', spanId: 's', name: 'segment' },
      { type: 'instant', ts: 150, track: 'participants/user/vad', spanId: 's', name: 'inside.span' },
    ])
    const rows = buildRows(state, { locale: 'en', hideEmpty: true }).filter(row => row.track.path === 'participants/user/vad')
    const items = rows.flatMap((row, index) => rowListItems(row, index, { from: 0, to: 1000 }, 100))

    // The canvas draws no band for an unknown state, and an instant of a span belongs to the span.
    expect(items.map(item => [item.target.kind, item.label])).toEqual([
      ['span', expect.stringContaining('segment')],
      ['state', 'State: speaking'],
      ['instant', 'vad.peak'],
    ])
    expect(items.find(item => item.target.kind === 'state')).toMatchObject({ start: 0, end: 500 })
  })

  it('keeps the lane of a track that has only samples', () => {
    const { state, indexes } = timelineOf([{ type: 'sample.chunk', ts: 0, track: 'participants/user/input', offsetsMs: [0, 100], values: { level: [0.2, 0.4] } }])
    const { lanes } = buildEntityLanes(state, indexes)
    expect(lanes.map(lane => lane.label)).toEqual(['User'])
  })

  it('gives the first row of an audio track room for its waveform once it has samples', () => {
    const records: Parameters<typeof timelineOf>[0] = [
      { type: 'span.begin', ts: 0, track: 'participants/user/input', spanId: 'i1', name: 'voice-input' },
      { type: 'span.begin', ts: 1, track: 'participants/user/input', spanId: 'i2', name: 'voice-input' },
      { type: 'span.begin', ts: 0, track: 'participants/user/asr', spanId: 'a', name: 'asr' },
    ]
    const heights = (state: ReturnType<typeof timelineOf>['state']) => buildRows(state, { locale: 'en', hideEmpty: true }).map(row => [row.key, rowHeightOf(row)])

    // Without samples, the audio track has the detail height, so hiding it moves no row.
    const empty = timelineOf(records).state
    expect(heights(empty)[0]).toEqual(['participants/user/input#0.0', ROW_GEOMETRY.height.detail])
    expect(rowHeightOf(buildRows(empty, { locale: 'en', hideEmpty: true, hidden: new Set(['participants/user/input']) })[0]!)).toBe(ROW_GEOMETRY.height.detail)

    const sampled = timelineOf([...records, { type: 'sample.chunk', ts: 0, track: 'participants/user/input', offsetsMs: [0, 32], values: { level: [0.2, 0.6] } }]).state
    expect(heights(sampled)).toEqual([
      ['participants/user/input#0.0', ROW_GEOMETRY.height.content],
      ['participants/user/input#0.1', ROW_GEOMETRY.height.detail],
      ['participants/user/asr#0.0', ROW_GEOMETRY.height.detail],
    ])
    expect(rowHeightOf(buildRows(sampled, { locale: 'en', hideEmpty: true, hidden: new Set(['participants/user/input']) })[0]!)).toBe(ROW_GEOMETRY.height.hidden)
  })

  it('draws one lane for each entity and merges the voice and agent tracks of one agent', () => {
    const { state, indexes } = timelineOf([
      { type: 'span.begin', ts: 0, track: 'participants/user/input', spanId: 'input', name: 'voice-input', ids: { input: 't1' } },
      { type: 'span.end', ts: 100, track: 'participants/user/input', spanId: 'input', status: 'ok' },
      { type: 'span.begin', ts: 110, track: 'agents/agent/turn', spanId: 'turn', name: 'chat-turn', ids: { turn: 't1' }, links: [{ rel: 'caused-by', to: { key: 'input', id: 't1' } }] },
      { type: 'span.begin', ts: 110, track: 'agents/agent/llm', spanId: 'llm', name: 'chat', parentSpanId: 'turn' },
      { type: 'instant', ts: 300, track: 'agents/agent/llm', spanId: 'llm', name: 'llm.first_chunk' },
      { type: 'span.end', ts: 500, track: 'agents/agent/llm', spanId: 'llm', status: 'ok' },
      { type: 'span.begin', ts: 400, track: 'participants/agent/playback', spanId: 'play', name: 'playback' },
    ])

    const { lanes, connectors } = buildEntityLanes(state, indexes)

    expect(lanes.map(lane => lane.key)).toEqual(['participant:user', 'participant:agent'])
    const agent = lanes[1]!
    expect(agent.running).toBe(true)
    expect(agent.segments.map(segment => [segment.name, segment.activity, segment.start, segment.end])).toEqual([
      ['chat-turn', 'waiting', 110, undefined],
      ['chat', 'thinking', 110, 300],
      ['chat', 'active', 300, 500],
      ['playback', 'active', 400, undefined],
    ])
    expect(connectors).toEqual([{ key: 'window:main/e1/turn:cause', time: 110, from: 'participant:user', to: 'participant:agent', kind: 'call', spanKey: 'window:main/e1/turn' }])
  })

  it('draws a call and a return for a child span on another lane', () => {
    const { state, indexes } = timelineOf([
      { type: 'span.begin', ts: 0, track: 'agents/orchestrator/turn', spanId: 'parent', name: 'chat-turn' },
      { type: 'span.begin', ts: 50, track: 'agents/researcher/turn', spanId: 'child', name: 'chat-turn', parentSpanId: 'parent' },
      { type: 'span.end', ts: 400, track: 'agents/researcher/turn', spanId: 'child', status: 'error' },
    ])

    const { lanes, connectors } = buildEntityLanes(state, indexes)

    expect(connectors.map(connector => [connector.kind, connector.time, connector.from, connector.to])).toEqual([
      ['call', 50, 'participant:orchestrator', 'participant:researcher'],
      ['return', 400, 'participant:researcher', 'participant:orchestrator'],
    ])
    expect(lanes.find(lane => lane.key === 'participant:researcher')?.failed).toBe(true)
  })
})
