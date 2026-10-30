import type { TraceFeedMessage, TraceRecord } from '@proj-airi/trace-kit'
import type { FlightRecorderDump } from '@proj-airi/trace-kit/collector'

import { describe, expect, it } from 'vitest'

import { IOTraceHub } from '.'

function createHub(options: { collecting?: boolean, now?: () => number } = {}) {
  let stored = options.collecting ?? true
  const hub = new IOTraceHub({
    getStoredCollecting: () => stored,
    setStoredCollecting: (collecting) => {
      stored = collecting
    },
    now: options.now ?? (() => 1000),
  })
  return { hub, stored: () => stored }
}

function windowRecords(source = 'window:a', epoch = 'e1') {
  let seq = 0
  return (record: Record<string, unknown>) => ({ source, epoch, seq: seq++, ts: 1000, clock: 'mono:collector', ...record }) as TraceRecord
}

function recordsOf(messages: TraceFeedMessage[]): TraceRecord[] {
  return messages.flatMap(message => message.kind === 'record' ? [message.record] : [])
}

describe('ioTraceHub', () => {
  it('ingests valid records, returns their sources, and drops invalid ones', () => {
    const { hub } = createHub()
    const record = windowRecords()

    const sources = hub.ingest([
      record({ type: 'source.started', format: 1, runtime: 'electron-renderer', profiles: [] }),
      record({ type: 'instant', track: 't', name: 'a' }),
      { type: 'instant', source: 'window:b' },
    ])

    expect([...sources]).toEqual(['window:a'])
    expect(hub.getState().dropped).toBe(1)
  })

  it('sends the backlog, then caughtUp, then later records to a subscriber', () => {
    const { hub } = createHub()
    const record = windowRecords()
    hub.ingest([record({ type: 'instant', track: 't', name: 'before' })])

    const messages: TraceFeedMessage[] = []
    const { unsubscribe } = hub.subscribe(message => messages.push(message), '*')
    hub.ingest([record({ type: 'instant', track: 't', name: 'live' })])
    unsubscribe()
    hub.ingest([record({ type: 'instant', track: 't', name: 'after' })])

    const names = messages.map(message => message.kind === 'record' && message.record.type === 'instant' ? message.record.name : message.kind)
    expect(names.filter(name => name !== 'record')).toEqual(['before', 'caughtUp', 'live'])
  })

  it('keeps no records while collecting is off, but still sends them to subscribers', () => {
    const { hub } = createHub({ collecting: false })
    const messages: TraceFeedMessage[] = []
    hub.subscribe(message => messages.push(message), '*')

    hub.ingest([windowRecords()({ type: 'instant', track: 't', name: 'a' })])

    expect(recordsOf(messages).some(record => record.type === 'instant')).toBe(true)
    expect(hub.getState().bufferedRecords).toBe(0)
  })

  it('stores the collecting setting and clears kept records when collecting stops', () => {
    const { hub, stored } = createHub()
    hub.ingest([windowRecords()({ type: 'instant', track: 't', name: 'a' })])
    expect(hub.getState().bufferedRecords).toBeGreaterThan(0)

    const state = hub.setCollecting(false)

    expect(state.collecting).toBe(false)
    expect(state.bufferedRecords).toBe(0)
    expect(stored()).toBe(false)
  })

  it('reports a closed source as lost', () => {
    const { hub } = createHub()
    hub.ingest([windowRecords()({ type: 'source.started', format: 1, runtime: 'electron-renderer', profiles: [] })])

    hub.closeSource('window:a')

    const messages: TraceFeedMessage[] = []
    hub.subscribe(message => messages.push(message), '*')
    expect(recordsOf(messages).find(record => record.type === 'source.lost')).toMatchObject({ reason: 'ipc-closed', of: { source: 'window:a', epoch: 'e1' } })
  })

  it('sends a flight dump when a span fails', () => {
    const { hub } = createHub()
    const dumps: FlightRecorderDump[] = []
    hub.onFlightDump(dump => dumps.push(dump))
    const record = windowRecords()

    hub.ingest([
      record({ type: 'span.begin', track: 't', spanId: 's', name: 'request' }),
      record({ type: 'span.end', track: 't', spanId: 's', status: 'error' }),
    ])

    expect(dumps).toHaveLength(1)
    expect(dumps[0]!.reason).toBe('error')
  })

  it('writes the failed span and the events before it to a flight dump while collecting is off', () => {
    const { hub } = createHub({ collecting: false })
    const dumps: FlightRecorderDump[] = []
    hub.onFlightDump(dump => dumps.push(dump))
    const record = windowRecords()

    hub.ingest([
      record({ type: 'instant', track: 't', name: 'before' }),
      record({ type: 'span.begin', track: 't', spanId: 's', name: 'request' }),
      record({ type: 'span.end', track: 't', spanId: 's', status: 'error' }),
    ])

    expect(dumps).toHaveLength(1)
    expect(dumps[0]!.records.map(item => item.type)).toEqual(expect.arrayContaining(['instant', 'span.begin', 'span.end']))
    // Collecting off keeps no history for viewers. The flight window is only for dumps.
    expect(hub.getState().bufferedRecords).toBe(0)
  })

  it('tells listeners the tracks that viewers show', () => {
    const { hub } = createHub()
    const wanted: Array<string[] | '*'> = []
    hub.onWantedChange(tracks => wanted.push(tracks))

    const viewer = hub.subscribe(() => {}, ['participants/user/input'])

    expect(hub.wantedTracks).toEqual(['participants/user/input'])
    viewer.unsubscribe()
    expect(wanted).toEqual([[], ['participants/user/input'], []])
  })
})
