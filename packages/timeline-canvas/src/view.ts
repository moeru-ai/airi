/** The visible time window and the pixel width that it maps to. Times are in milliseconds on one clock. */
export interface TimelineView {
  start: number
  end: number
  /** CSS pixels. */
  width: number
}

/** Pixels for one millisecond. */
export function pixelsPerMs(view: TimelineView): number {
  return view.width / Math.max(Number.EPSILON, view.end - view.start)
}

/** The x offset of a time, in CSS pixels from the left of the view. */
export function timeToX(view: TimelineView, time: number): number {
  return (time - view.start) * pixelsPerMs(view)
}

/** The time at an x offset, in CSS pixels from the left of the view. */
export function xToTime(view: TimelineView, x: number): number {
  return view.start + x / pixelsPerMs(view)
}
