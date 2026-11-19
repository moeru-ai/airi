import { PointColumn } from '@proj-airi/timeline-canvas'
import { describe, expect, it } from 'vitest'

import { pointRingBoxes } from './point-rings'

describe('pointRingBoxes', () => {
  const view = { start: 0, end: 1000, width: 1000 }
  const geometry = { top: 10, height: 20 }

  function column(times: number[]) {
    const points = new PointColumn()
    const targets = times.map((_, index) => ({ key: `p${index}` }))
    for (const [index, time] of times.entries())
      points.append(time, 0, `p${index}`)
    return { points, targets }
  }

  it('gives a ring box at the dot of each marked point', () => {
    const { points, targets } = column([100, 400, 700])

    const boxes = pointRingBoxes(points, targets, ['p1', undefined, 'p2', 'p1'], view, geometry)

    // The dot has a radius of 3 in the middle of the row, at y = 20.
    expect(boxes).toEqual([
      { key: 'p1', index: 1, x0: 397, x1: 403, top: 17, height: 6, radius: 3 },
      { key: 'p2', index: 2, x0: 697, x1: 703, top: 17, height: 6, radius: 3 },
    ])
  })

  it('leaves out marked points outside the view, and sees points appended in place', () => {
    const { points, targets } = column([100, 400])
    expect(pointRingBoxes(points, targets, ['p1'], { ...view, start: 500 }, geometry)).toEqual([])

    // An in-order append, with its target at the same index.
    points.append(900, 0, 'p2')
    targets.push({ key: 'p2' })
    expect(pointRingBoxes(points, targets, ['p2'], view, geometry).map(box => box.x0)).toEqual([897])
  })
})
