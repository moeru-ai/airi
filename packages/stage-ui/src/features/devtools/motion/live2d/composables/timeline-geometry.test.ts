import type { Live2DMotionOverlay } from './keyframes'

import { describe, expect, it } from 'vitest'

import {
  fullMotionView,
  keyframeAt,
  keyframeFromPointer,
  layoutMotionTracks,
  motionGraphGeometry,
  motionTrackAt,
  overlayCurveAt,
  overlayEdgeAt,
  visibleMotionRange,
} from './timeline-geometry'

/** One pixel for each millisecond, from time 0 at x 0. */
const view = { start: 0, end: 1000, width: 1000 }
/** A graph from y 0 to y 200: value 1 at the top, -1 at the bottom, 0 in the middle. */
const graph = { top: 0, height: 200 }

function overlay(patch: Partial<Live2DMotionOverlay> = {}): Live2DMotionOverlay {
  return {
    id: 'overlay',
    name: 'L1',
    trackId: 'headX',
    blendMode: 'add',
    weight: 1,
    startMs: 100,
    endMs: 500,
    points: [
      { id: 'first', atMs: 100, value: 0 },
      { id: 'second', atMs: 500, value: 1 },
    ],
    ...patch,
  }
}

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

  it('finds the row under a content offset', () => {
    const { rows } = layoutMotionTracks(['headX', 'headY'], 'headX')

    expect(motionTrackAt(rows, 299)?.trackId).toBe('headX')
    expect(motionTrackAt(rows, 300)?.trackId).toBe('headY')
    expect(motionTrackAt(rows, 364)).toBeUndefined()
  })

  it('insets the graph inside its row and follows the scroll position', () => {
    expect(motionGraphGeometry({ trackId: 'headX', top: 100, height: 300 }, 40)).toEqual({ top: 72, height: 276 })
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

describe('motion timeline pointer', () => {
  it('maps a pointer to a keyframe time and value', () => {
    expect(keyframeFromPointer(view, graph, [-1, 1], 250.4, 50)).toEqual({ atMs: 250, value: 0.5 })
  })

  it('clamps a pointer outside the graph to the track range', () => {
    expect(keyframeFromPointer(view, graph, [0, 1], 10, -40).value).toBe(1)
    expect(keyframeFromPointer(view, graph, [0, 1], 10, 400).value).toBe(0)
  })

  it('hits the keyframe dot nearest to the pointer', () => {
    const points = overlay().points

    // The first key is at x 100 and y 100. The second is at x 500 and y 0.
    expect(keyframeAt(points, view, graph, [-1, 1], 104, 103)).toBe('first')
    expect(keyframeAt(points, view, graph, [-1, 1], 498, 4)).toBe('second')
  })

  it('misses a keyframe when the pointer is above or below its dot', () => {
    expect(keyframeAt(overlay().points, view, graph, [-1, 1], 100, 120)).toBeUndefined()
  })

  it('hits the nearer edge of an overlay', () => {
    expect(overlayEdgeAt(overlay(), view, 104)).toBe('start')
    expect(overlayEdgeAt(overlay(), view, 497)).toBe('end')
    expect(overlayEdgeAt(overlay(), view, 300)).toBeUndefined()
  })

  it('selects an overlay near its curve inside its span', () => {
    const curve = overlay()

    // Halfway through the span, the curve is at value 0.5, that is y 50.
    expect(overlayCurveAt([curve], view, graph, [-1, 1], 300, 53)).toBe(curve)
    expect(overlayCurveAt([curve], view, graph, [-1, 1], 300, 90)).toBeUndefined()
    expect(overlayCurveAt([curve], view, graph, [-1, 1], 700, 0)).toBeUndefined()
  })

  it('reads a view-target curve as held keys', () => {
    const held = overlay({ trackId: 'viewTargetX', startMs: 0, endMs: 1000, points: [{ id: 'a', atMs: 0, value: 1 }, { id: 'b', atMs: 1000, value: -1 }] })

    // The first key holds at value 1, that is y 0, until the second key.
    expect(overlayCurveAt([held], view, graph, [-1, 1], 900, 2)).toBe(held)
  })

  it('prefers the overlay that draws on top', () => {
    const below = overlay({ id: 'below' })
    const above = overlay({ id: 'above' })

    expect(overlayCurveAt([below, above], view, graph, [-1, 1], 300, 50)?.id).toBe('above')
  })
})
