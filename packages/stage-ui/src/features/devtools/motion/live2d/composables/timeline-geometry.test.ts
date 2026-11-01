import { describe, expect, it } from 'vitest'

import { fullMotionView, layoutMotionTracks, motionValueScale, visibleMotionRange } from './timeline-geometry'

describe('motion timeline layout', () => {
  it('expands the active track and stacks the rows', () => {
    const layout = layoutMotionTracks(['headX', 'headY', 'headZ'], 'headY')

    expect(layout.rows).toEqual([
      { trackId: 'headX', top: 0, height: 64 },
      { trackId: 'headY', top: 64, height: 300 },
      { trackId: 'headZ', top: 364, height: 64 },
    ])
    expect(layout.height).toBe(428)
  })

  it('insets the graph inside its row and clamps a pointer outside it to the track range', () => {
    const y = motionValueScale({ trackId: 'headX', top: 100, height: 300 })

    expect(y(1)).toBe(12)
    expect(y(-1)).toBe(288)
    expect(y.invert(150)).toBe(0)
    expect(y.invert(-40)).toBe(1)
  })
})

describe('motion timeline view', () => {
  it('fits the whole motion right of the label column', () => {
    const next = fullMotionView(1000, 1224, 200)

    expect(next).toEqual({ start: -212, end: 1012 })
    expect(visibleMotionRange({ ...next, width: 1224 }, 200, 1000)).toEqual([0, 1000])
  })

  it('reports the visible part of the motion after a zoom', () => {
    expect(visibleMotionRange({ start: 0, end: 800, width: 1000 }, 250, 1000)).toEqual([200, 800])
  })

  it('reports a range without length when the view shows no part of the motion', () => {
    const [start, end] = visibleMotionRange({ start: 2000, end: 3000, width: 1000 }, 0, 1000)

    expect(end).toBeLessThanOrEqual(start)
  })
})
