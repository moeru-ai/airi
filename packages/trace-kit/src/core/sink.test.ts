import type { TraceRecordInput } from './types'

import { describe, expect, it } from 'vitest'

import { SeriesWriter } from './sink'

function createSink(wanted = true) {
  const records: TraceRecordInput[] = []
  let now = 0
  return {
    records,
    advance: (ms: number) => {
      now += ms
    },
    sink: { emit: (record: TraceRecordInput) => records.push(record), wants: () => wanted, now: () => now },
  }
}

describe('series writer', () => {
  it('writes one chunk for each second, with offsets from its first sample', () => {
    const { records, sink, advance } = createSink()
    const writer = new SeriesWriter(() => sink, { track: 'participants/user/input' })
    for (let index = 0; index < 30; index++) {
      writer.push({ level: index / 30 })
      advance(50)
    }
    writer.flush()

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ type: 'sample.chunk', ts: 0, track: 'participants/user/input' })
    expect(records[0]!.type === 'sample.chunk' && records[0]!.offsetsMs).toEqual(Array.from({ length: 20 }, (_, index) => index * 50))
    expect(records[1]).toMatchObject({ ts: 1000 })
  })

  it('drops samples while no reader wants the track', () => {
    const { records, sink } = createSink(false)
    const writer = new SeriesWriter(() => sink, { track: 'participants/user/input' })
    writer.push({ probability: 0.4 })
    writer.flush()
    expect(records).toHaveLength(0)
  })

  it('starts a new chunk when the keys change, so every column has one value per offset', () => {
    const { records, sink, advance } = createSink()
    const writer = new SeriesWriter(() => sink, { track: 'participants/user/input' })
    writer.push({ level: 0.1 })
    advance(10)
    writer.push({ level: 0.2, peak: 0.5 })
    writer.flush()
    expect(records.map(record => record.type === 'sample.chunk' ? Object.keys(record.values) : [])).toEqual([['level'], ['level', 'peak']])
  })
})
