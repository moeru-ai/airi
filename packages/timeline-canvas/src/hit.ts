import type { IntervalColumn, PointColumn } from './columns'
import type { TimelineView } from './view'

import { pixelsPerMs, xToTime } from './view'

/**
 * The interval under an x offset, or undefined.
 *
 * An interval that covers the time wins, and of several the one that starts last, because it draws on top. Otherwise
 * the nearest interval within `tolerancePx` wins, so a very short interval can still be hit.
 */
export function hitInterval(column: IntervalColumn, view: TimelineView, x: number, options: { now?: number, tolerancePx?: number } = {}): number | undefined {
  const tolerance = (options.tolerancePx ?? 3) / pixelsPerMs(view)
  const time = xToTime(view, x)
  const openEnd = options.now ?? view.end
  let covering: number | undefined
  let nearest: number | undefined
  let nearestDistance = Number.POSITIVE_INFINITY

  const check = (index: number) => {
    const start = column.starts[index]!
    const rawEnd = column.ends[index]!
    const end = Number.isNaN(rawEnd) ? Math.max(start, openEnd) : rawEnd
    if (start <= time && time <= end) {
      if (covering === undefined || start >= column.starts[covering]!)
        covering = index
      return
    }
    const distance = time < start ? start - time : time - end
    if (distance <= tolerance && distance < nearestDistance) {
      nearest = index
      nearestDistance = distance
    }
  }

  const { begin, end } = column.visibleRange(time - tolerance, time + tolerance)
  for (const index of column.openIndices) {
    if (index < begin)
      check(index)
  }
  for (let index = begin; index < end; index++)
    check(index)
  return covering ?? nearest
}

/** The point nearest to an x offset within `tolerancePx`, or undefined. */
export function hitPoint(column: PointColumn, view: TimelineView, x: number, options: { tolerancePx?: number } = {}): number | undefined {
  const tolerance = (options.tolerancePx ?? 4) / pixelsPerMs(view)
  const time = xToTime(view, x)
  const { begin, end } = column.visibleRange(time - tolerance, time + tolerance)
  let nearest: number | undefined
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = begin; index < end; index++) {
    const distance = Math.abs(column.times[index]! - time)
    if (distance < nearestDistance) {
      nearest = index
      nearestDistance = distance
    }
  }
  return nearest
}
