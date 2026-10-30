import type { PointColumn, TimelineView } from '@proj-airi/timeline-canvas'

import type { TimelineItemRef } from '../headless'

import { timeToX } from '@proj-airi/timeline-canvas'

/** The box of a point for its ring, in the shape of `strokeItemRing`. */
export interface PointRingBox {
  x0: number
  x1: number
  top: number
  height: number
  radius: number
  /** The key of the item of the point. */
  key: string
  /** The index of the point in its column. */
  index: number
}

/** The point indices of each item key, by target array. A new count rebuilds it, so an in-place append stays right. */
const indexCache = new WeakMap<readonly TimelineItemRef[], { count: number, byKey: Map<string, number[]> }>()

function indicesByKey(targets: readonly TimelineItemRef[]): Map<string, number[]> {
  const cached = indexCache.get(targets)
  if (cached && cached.count === targets.length)
    return cached.byKey
  const byKey = new Map<string, number[]>()
  for (const [index, target] of targets.entries()) {
    const list = byKey.get(target.key)
    if (list)
      list.push(index)
    else
      byKey.set(target.key, [index])
  }
  indexCache.set(targets, { count: targets.length, byKey })
  return byKey
}

/**
 * The ring boxes of the visible points whose item key is in `keys`, for example the selected, hovered, and focused
 * items. A box has the size of the dot that `drawPointMarks` draws in the middle of the row.
 *
 * A frame looks up only the marked keys, so the cost does not grow with the number of points.
 */
export function pointRingBoxes<Item extends TimelineItemRef>(points: PointColumn, targets: readonly Item[], keys: Iterable<string | undefined>, view: TimelineView, geometry: { top: number, height: number }): PointRingBox[] {
  const boxes: PointRingBox[] = []
  if (points.count === 0)
    return boxes
  const radius = Math.min(3, geometry.height / 2 - 1)
  const middle = geometry.top + geometry.height / 2
  const byKey = indicesByKey(targets)
  for (const key of new Set(keys)) {
    if (key === undefined)
      continue
    for (const index of byKey.get(key) ?? []) {
      const time = points.times[index]
      if (index >= points.count || time === undefined || time < view.start || time > view.end)
        continue
      const x = timeToX(view, time)
      boxes.push({ x0: x - radius, x1: x + radius, top: middle - radius, height: radius * 2, radius, key, index })
    }
  }
  return boxes
}
