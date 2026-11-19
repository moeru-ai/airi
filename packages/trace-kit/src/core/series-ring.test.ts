import { describe, expect, it } from 'vitest'

import { SeriesRing } from './series-ring'

describe('seriesRing', () => {
  it('inserts a late point before the compacted points that are newer', () => {
    const ring = new SeriesRing(60_000, 1000)
    ring.append(5000, 1)
    ring.append(5500, 2)
    ring.compact(10_000)
    ring.append(3000, 3)

    expect(ring.read().times).toEqual([3000, 5000, 5500])
  })

  it('drops a late point at expiry after it was inserted before compacted points', () => {
    const ring = new SeriesRing(5000, 1000)
    ring.append(5000, 1)
    ring.compact(6500)
    ring.append(1000, 2)
    ring.compact(9000)

    expect(ring.read().times).toEqual([5000])
  })

  it('changes its revision only when points that were in the ring change', () => {
    const ring = new SeriesRing(60_000, 1000)
    ring.append(1000, 1)
    ring.append(1500, 2)
    ring.append(2000, 3)
    const appended = ring.revision
    ring.append(1200, 4)
    const lateInsert = ring.revision
    ring.compact(10_000)

    expect(appended).toBe(0)
    expect(lateInsert).toBe(1)
    expect(ring.revision).toBe(2)
    expect(ring.timesView()).toEqual(new Float64Array(ring.read().times))
  })
})
