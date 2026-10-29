import type { TraceFeedMessage } from '../core/feed'
import type { TraceRecord } from '../core/types'
import type { FlightRecorderDump } from './types'

import { describe, expect, it } from 'vitest'

import { ATTR_GEN_AI_TOOL_CALL_ARGUMENTS } from '../conventions'
import { TraceSource } from '../core/sink'
import { TraceCollector } from './collector'

function setup(options: Partial<ConstructorParameters<typeof TraceCollector>[0]> = {}) {
  let now = 1000
  let epochs = 0
  const collector = new TraceCollector({ now: () => now, createEpoch: () => `e${epochs++}`, ...options })
  const source = (name: string) => new TraceSource({ source: name, clock: 'mono:collector', runtime: 'test', now: () => now, createEpoch: () => `e${epochs++}`, send: record => collector.ingest(record) })
  const advance = (ms: number) => {
    now += ms
  }
  return { collector, source, advance, now: () => now }
}

function recordsOf(messages: TraceFeedMessage[]): TraceRecord[] {
  return messages.flatMap(message => message.kind === 'record' ? [message.record] : [])
}

describe('traceCollector', () => {
  it('drops a record with a seen sequence number', () => {
    const { collector } = setup()
    const record: TraceRecord = { type: 'instant', source: 'w', epoch: 'x', seq: 0, ts: 1, clock: 'mono:collector', track: 't', name: 'a' }
    collector.ingest(record)
    collector.ingest(record)

    // The collector's own `source.started`, and one copy of the instant.
    expect(collector.stats.bufferedRecords).toBe(2)
  })

  it('sends the pinned set, the buffer, and caughtUp before live records', () => {
    const { collector, source } = setup()
    const window = source('window:main')
    window.emit({ type: 'span.begin', ts: 1000, track: 't', spanId: 's1', name: 'open', attrs: { a: 1 } })
    window.emit({ type: 'span.update', ts: 1000, track: 't', spanId: 's1', attrs: { b: 2 } })

    const messages: TraceFeedMessage[] = []
    collector.subscribe(message => messages.push(message))
    window.emit({ type: 'instant', ts: 1000, track: 't', name: 'live' })

    const pinnedSpan = messages.find(message => message.kind === 'record' && message.pinned && message.record.type === 'span.begin')
    expect(pinnedSpan?.kind === 'record' && pinnedSpan.record.attrs).toEqual({ a: 1, b: 2 })
    const caughtUpIndex = messages.findIndex(message => message.kind === 'caughtUp')
    expect(caughtUpIndex).toBe(messages.length - 2)
    expect(messages.at(-1)).toMatchObject({ kind: 'record', record: { name: 'live' } })
  })

  it('writes source.lost epoch-replaced when a new epoch starts before the old one stops', () => {
    const { collector, source } = setup()
    const first = source('window:main')
    first.emit({ type: 'span.begin', ts: 1000, track: 't', spanId: 's1', name: 'open' })
    source('window:main')

    const lost = collector.snapshot().find(record => record.type === 'source.lost')
    expect(lost).toMatchObject({ source: 'collector', reason: 'epoch-replaced', of: { source: 'window:main', epoch: first.epoch } })
    expect(collector.stats.openSpans).toBe(0)
  })

  it('forgets the streams of an epoch that ends before its stream.stopped', () => {
    const { collector, source } = setup()
    const first = source('window:main')
    first.emit({ type: 'stream.started', ts: 1000, streamId: 'mic', mediaType: 'audio/pcm', rate: 16000 })
    // A new epoch of the same source replaces the first one, which never stopped its stream.
    source('window:main')

    const messages: TraceFeedMessage[] = []
    collector.subscribe(message => messages.push(message))
    // The buffer still holds the record. The pinned set, which tells a new viewer what is active, must not.
    const pinnedStreams = messages.filter(message => message.kind === 'record' && message.pinned && message.record.type === 'stream.started')
    expect(pinnedStreams).toEqual([])
  })

  it('loses a source after the heartbeat timeout', () => {
    const { collector, source, advance } = setup({ heartbeatTimeoutMs: 1000 })
    source('window:main')
    advance(1500)
    collector.tick()

    const messages: TraceFeedMessage[] = []
    collector.subscribe(message => messages.push(message))
    expect(recordsOf(messages).find(record => record.type === 'source.lost')).toMatchObject({ reason: 'heartbeat-timeout' })
  })

  it('evicts old records and tells viewers about the gap', () => {
    const { collector, source, advance } = setup({ maxAgeMs: 1000 })
    const window = source('window:main')
    window.emit({ type: 'instant', ts: 1000, track: 't', name: 'old' })
    advance(2000)
    window.emit({ type: 'instant', ts: 3000, track: 't', name: 'new' })
    collector.tick()

    const messages: TraceFeedMessage[] = []
    collector.subscribe(message => messages.push(message))
    expect(messages.some(message => message.kind === 'gap')).toBe(true)
    expect(recordsOf(messages).some(record => record.type === 'instant' && record.name === 'old')).toBe(false)
    expect(recordsOf(messages).some(record => record.type === 'instant' && record.name === 'new')).toBe(true)
    // The pinned set keeps the start of the live epoch after its buffered copy is evicted.
    expect(recordsOf(messages).some(record => record.type === 'source.started' && record.source === 'window:main')).toBe(true)
  })

  it('dumps once per span, keeps a cooldown per source, and appends an overlapping window', () => {
    const dumps: FlightRecorderDump[] = []
    const { source, advance } = setup({ flightRecorder: { windowMs: 60_000, cooldownMs: 30_000, onDump: dump => dumps.push(dump) } })
    const window = source('window:main')
    const fail = (spanId: string) => {
      window.emit({ type: 'span.begin', ts: 0, track: 't', spanId, name: 'request' })
      window.emit({ type: 'span.end', ts: 0, track: 't', spanId, status: 'error' })
    }

    fail('a')
    fail('b')
    expect(dumps).toHaveLength(1)
    expect(dumps[0]!.append).toBe(false)

    advance(31_000)
    fail('c')
    expect(dumps).toHaveLength(2)
    expect(dumps[1]!.append).toBe(true)
    expect(dumps[1]!.from).toBe(dumps[0]!.to)

    advance(61_000)
    fail('d')
    expect(dumps).toHaveLength(3)
    expect(dumps[2]!.append).toBe(false)
  })

  it('scrubs secrets from attributes but keeps content in the live buffer', () => {
    const { collector, source } = setup()
    source('window:main').emit({ type: 'instant', ts: 0, track: 't', name: 'tool', attrs: { [ATTR_GEN_AI_TOOL_CALL_ARGUMENTS]: 'say hi', error: 'Authorization: Bearer abcdefghijklmnopqrstu' } })

    const instant = collector.snapshot().find(record => record.type === 'instant')
    expect(instant?.attrs).toEqual({ [ATTR_GEN_AI_TOOL_CALL_ARGUMENTS]: 'say hi', error: 'Authorization: [secret]' })
  })

  it('keeps series in rings and sends them to a late viewer', () => {
    const { collector, source } = setup()
    source('window:main').emit({ type: 'sample.chunk', ts: 1000, track: 'participants/user/input', intervalMs: 50, values: { probability: [0.1, 0.9, 0.3] } })

    const messages: TraceFeedMessage[] = []
    collector.subscribe(message => messages.push(message))
    expect(messages.find(message => message.kind === 'series')).toEqual({ kind: 'series', source: 'window:main', track: 'participants/user/input', key: 'probability', times: [1000, 1050, 1100], values: [expect.closeTo(0.1), expect.closeTo(0.9), expect.closeTo(0.3)] })
    expect(collector.stats.bufferedRecords).toBe(2)
  })

  it('tells producers the union of the tracks that viewers show', () => {
    const wanted: Array<ReadonlySet<string> | '*'> = []
    const { collector } = setup({ onWantedChange: tracks => wanted.push(tracks) })
    const first = collector.subscribe(() => {}, ['a'])
    collector.subscribe(() => {}, ['b'])
    first.unsubscribe()

    expect(wanted.map(tracks => tracks === '*' ? '*' : [...tracks])).toEqual([['a'], ['a', 'b'], ['b']])
  })

  it('does not tell producers again when the union stays the same', () => {
    const wanted: Array<ReadonlySet<string> | '*'> = []
    const { collector } = setup({ onWantedChange: tracks => wanted.push(tracks) })
    const viewer = collector.subscribe(() => {}, ['a'])
    viewer.setTracks(['a'])
    collector.subscribe(() => {}, ['a'])

    expect(wanted.map(tracks => tracks === '*' ? '*' : [...tracks])).toEqual([['a']])
  })
})
