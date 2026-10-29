import { describe, expect, it } from 'vitest'

import { createRecordStamper } from '../testing'
import { TraceReader } from './reader'
import { createTimelineProjection } from './timeline'

describe('traceReader', () => {
  it('converts the clocks of the next trace without the snapshots of the previous trace after reset', () => {
    const timeline = createTimelineProjection()
    const reader = new TraceReader([timeline])
    const snapshotOf = (record: ReturnType<typeof createRecordStamper>, trace: number) => record({ type: 'clock.snapshot', ts: 0, values: [{ clock: 'mono:window', value: 0 }, { clock: 'mono:collector', value: trace }], uncertaintyMs: 0.1 })

    const first = createRecordStamper({ epoch: 'e1', clock: 'mono:window' })
    reader.handleRecords([snapshotOf(first, 1000)])
    reader.reset()
    const second = createRecordStamper({ epoch: 'e2', clock: 'mono:window' })
    reader.handleRecords([snapshotOf(second, 5000), second({ type: 'instant', ts: 10, track: 't', name: 'next' })])

    expect(reader.view(timeline).tracks.get('t')!.instants[0]!.time).toBe(5010)
  })
})
