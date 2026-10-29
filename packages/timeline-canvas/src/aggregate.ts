import type { IntervalColumn, PointColumn } from './columns'
import type { TimelineView } from './view'

import { pixelsPerMs } from './view'

/**
 * One shape to draw: an interval, or several narrow intervals of one style merged into one run.
 *
 * `x0` and `x1` are CSS pixels from the left of the view, clipped to a little outside the view.
 */
export interface IntervalRun {
  x0: number
  x1: number
  style: number
  /** The first interval of the run, for its key and label. */
  index: number
  /** Intervals in the run. A run of one is a single interval and can carry a label. */
  count: number
  /** The interval is open and draws to now. */
  open: boolean
}

export interface IntervalRunOptions {
  /** The end of an open interval. Undefined draws an open interval to the right edge of the view. */
  now?: number
  /**
   * Intervals narrower than this many pixels merge with a neighbor of the same style that touches them.
   * Wider intervals always draw on their own. @default 2
   */
  mergeBelowPx?: number
  /** A drawn interval is at least this wide, so a very short interval still shows. @default 1 */
  minWidthPx?: number
}

/** Pixels outside the view that a shape can reach, so a clipped edge does not draw a rounded corner in view. */
const CLIP_MARGIN_PX = 8

/**
 * The shapes of the visible intervals of a column.
 *
 * The work is linear in the number of visible intervals, and the output is bounded by the view width times the number
 * of styles, because narrow intervals merge. That keeps a million intervals drawable when zoomed out.
 *
 * The shapes of one style come out in start order. Shapes of different styles can interleave out of order.
 * Wider intervals can overlap, and a later run draws over an earlier one.
 */
export function intervalRuns(column: IntervalColumn, view: TimelineView, options: IntervalRunOptions = {}): IntervalRun[] {
  const mergeBelowPx = options.mergeBelowPx ?? 2
  const minWidthPx = options.minWidthPx ?? 1
  const ppm = pixelsPerMs(view)
  const right = view.width + CLIP_MARGIN_PX
  const openEnd = options.now ?? view.end
  const runs: IntervalRun[] = []
  // One run in progress for each style. Interleaved styles, such as thinking and active work, still merge.
  const current = new Map<number, IntervalRun>()

  const take = (index: number) => {
    const start = column.starts[index]!
    const rawEnd = column.ends[index]!
    const open = Number.isNaN(rawEnd)
    const end = open ? Math.max(start, openEnd) : rawEnd
    if (end < view.start || start > view.end)
      return
    const x0 = Math.max(-CLIP_MARGIN_PX, (start - view.start) * ppm)
    const x1 = Math.min(right, Math.max(x0 + minWidthPx, (end - view.start) * ppm))
    const style = column.styles[index]!
    const run = current.get(style)

    if (x1 - x0 >= mergeBelowPx) {
      // The run of the same style ends first, so the shapes of one style stay in start order.
      if (run) {
        runs.push(run)
        current.delete(style)
      }
      runs.push({ x0, x1, style, index, count: 1, open })
      return
    }
    if (run && x0 <= run.x1 + 1) {
      run.x1 = Math.max(run.x1, x1)
      run.count++
      run.open ||= open
      return
    }
    if (run)
      runs.push(run)
    current.set(style, { x0, x1, style, index, count: 1, open })
  }

  const flush = () => {
    for (const run of current.values())
      runs.push(run)
    current.clear()
  }

  // An open interval can start long before the view. It is outside the searched range, so it is taken first.
  const { begin, end } = column.visibleRange(view.start, view.end)
  for (const index of column.openIndices) {
    if (index < begin)
      take(index)
  }
  flush()
  for (let index = begin; index < end; index++)
    take(index)
  flush()
  return runs
}

/** A point, or a bucket of points too dense to draw one by one. */
export type PointMark
  = | { kind: 'point', x: number, style: number, index: number }
    | { kind: 'bucket', x0: number, x1: number, count: number, style: number, index: number }

export interface PointMarkOptions {
  /** Points closer than this many pixels on average switch the lane to buckets of this width. @default 3 */
  bucketPx?: number
}

/**
 * The marks of the visible points of a column.
 *
 * Sparse points draw one by one, and a point closer than `bucketPx` to the last drawn point is skipped. Dense points
 * draw as a histogram of `bucketPx` buckets. A bucket takes the style of its first point.
 */
export function pointMarks(column: PointColumn, view: TimelineView, options: PointMarkOptions = {}): PointMark[] {
  const bucketPx = options.bucketPx ?? 3
  const ppm = pixelsPerMs(view)
  const { begin, end } = column.visibleRange(view.start, view.end)
  const visible = end - begin
  const marks: PointMark[] = []
  if (visible <= 0)
    return marks

  if (visible <= view.width / bucketPx) {
    let lastX = Number.NEGATIVE_INFINITY
    for (let index = begin; index < end; index++) {
      const x = (column.times[index]! - view.start) * ppm
      if (x - lastX < bucketPx)
        continue
      marks.push({ kind: 'point', x, style: column.styles[index]!, index })
      lastX = x
    }
    return marks
  }

  const bucketCount = Math.ceil(view.width / bucketPx)
  const counts = new Uint32Array(bucketCount)
  const firsts = new Int32Array(bucketCount).fill(-1)
  for (let index = begin; index < end; index++) {
    const bucket = Math.min(bucketCount - 1, Math.max(0, Math.floor((column.times[index]! - view.start) * ppm / bucketPx)))
    counts[bucket]!++
    if (firsts[bucket] === -1)
      firsts[bucket] = index
  }
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    if (counts[bucket] === 0)
      continue
    const index = firsts[bucket]!
    marks.push({ kind: 'bucket', x0: bucket * bucketPx, x1: (bucket + 1) * bucketPx, count: counts[bucket]!, style: column.styles[index]!, index })
  }
  return marks
}
