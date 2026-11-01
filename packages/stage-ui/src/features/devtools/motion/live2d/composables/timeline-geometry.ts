import type { RowGeometry, TimelineView, ValueRange } from '@proj-airi/timeline-canvas'
import type { TimelineItemRef } from '@proj-airi/ui-timeline/headless'

import type { Live2DMotionEditableTrackId, Live2DMotionKeyframe, Live2DMotionOverlay } from './keyframes'

import { timeToX, valueToY, xToTime, yToValue } from '@proj-airi/timeline-canvas'

import { evaluateLive2DMotionOverlay } from './keyframes'

/** Row heights of the motion timeline. The active track expands, so its curve has room for keyframe edits. */
export const motionTrackHeights = { active: 300, idle: 64 } as const

/** Space between the edge of a track row and its graph, so a keyframe dot at the edge of the range shows whole. */
const GRAPH_INSET_PX = 12

/**
 * Space at each end of the full view. A keyframe at time 0 or at the end of the motion then shows whole, clear of the
 * label column.
 */
const VIEW_PADDING_PX = 12

/** The pointer distances in CSS pixels that still hit a target of the motion timeline. */
const hitTolerancePx = {
  /** The radius of a keyframe dot, with a little room around it. */
  keyframe: 8,
  /** Half the width of the drag handle at each end of an overlay. */
  edge: 6,
  /** The distance from an overlay curve that selects the overlay. */
  curve: 6,
} as const

/**
 * An item of the motion timeline: an overlay, or a keyframe of the selected overlay. The timeline selects and lists
 * items by `key`. A selected item selects its overlay in the editor.
 */
export interface MotionTimelineItem extends TimelineItemRef {
  kind: 'overlay' | 'keyframe'
  overlayId: string
  trackId: Live2DMotionEditableTrackId
}

/** One track row in the scroll content of the timeline. `top` is in CSS pixels from the top of the lanes. */
export interface MotionTrackRow {
  trackId: Live2DMotionEditableTrackId
  top: number
  height: number
}

/** The rows of the tracks from top to bottom, and the height of all rows. */
export function layoutMotionTracks(
  trackIds: readonly Live2DMotionEditableTrackId[],
  activeTrackId: Live2DMotionEditableTrackId,
): { rows: MotionTrackRow[], height: number } {
  const rows: MotionTrackRow[] = []
  let top = 0
  for (const trackId of trackIds) {
    const height = trackId === activeTrackId ? motionTrackHeights.active : motionTrackHeights.idle
    rows.push({ trackId, top, height })
    top += height
  }
  return { rows, height: top }
}

/** The row at a y offset in the scroll content, or undefined below the last row. */
export function motionTrackAt(rows: readonly MotionTrackRow[], contentY: number): MotionTrackRow | undefined {
  return rows.find(row => contentY >= row.top && contentY < row.top + row.height)
}

/**
 * Where the curve graph of a row draws on the canvas. The canvas sits at the scroll position of the lanes, so a row
 * top in the scroll content minus `scrollTop` is a canvas y offset.
 */
export function motionGraphGeometry(row: MotionTrackRow, scrollTop: number): RowGeometry {
  return { top: row.top - scrollTop + GRAPH_INSET_PX, height: row.height - GRAPH_INSET_PX * 2 }
}

/**
 * The view that shows the whole motion right of the label column. The label column covers the left of the lanes, so
 * the view starts before time 0 by the label width.
 *
 * @example
 * fullMotionView(1000, 1224, 200)
 * // => { start: -212, end: 1012 }
 */
export function fullMotionView(durationMs: number, width: number, labelWidth: number): { start: number, end: number } {
  const visibleWidth = Math.max(1, width - labelWidth - VIEW_PADDING_PX * 2)
  const msPerPx = Math.max(1, durationMs) / visibleWidth
  const start = -(labelWidth + VIEW_PADDING_PX) * msPerPx
  return { start, end: start + width * msPerPx }
}

/**
 * The part of the motion that shows right of the label column, inside `[0, durationMs]`. The crop action keeps this
 * range. A view that shows no part of the motion gives a range whose end is not after its start.
 */
export function visibleMotionRange(view: TimelineView, labelWidth: number, durationMs: number): readonly [number, number] {
  return [Math.max(0, xToTime(view, labelWidth)), Math.min(durationMs, view.end)]
}

/** The ID of the keyframe whose dot is nearest to a canvas position, or undefined when no dot is in reach. */
export function keyframeAt(
  points: readonly Live2DMotionKeyframe[],
  view: TimelineView,
  geometry: RowGeometry,
  range: ValueRange,
  x: number,
  y: number,
): string | undefined {
  let nearest: string | undefined
  let nearestDistance: number = hitTolerancePx.keyframe
  for (const point of points) {
    const distance = Math.hypot(timeToX(view, point.atMs) - x, valueToY(range, geometry, point.value) - y)
    if (distance <= nearestDistance) {
      nearest = point.id
      nearestDistance = distance
    }
  }
  return nearest
}

/** The end of an overlay whose drag handle is under a canvas x offset. The nearer end wins when both are in reach. */
export function overlayEdgeAt(overlay: Pick<Live2DMotionOverlay, 'startMs' | 'endMs'>, view: TimelineView, x: number): 'start' | 'end' | undefined {
  const startDistance = Math.abs(timeToX(view, overlay.startMs) - x)
  const endDistance = Math.abs(timeToX(view, overlay.endMs) - x)
  if (Math.min(startDistance, endDistance) > hitTolerancePx.edge)
    return undefined
  return startDistance <= endDistance ? 'start' : 'end'
}

/**
 * The overlay whose curve passes near a canvas position. Overlays later in the list draw on top, so they win. Only an
 * overlay whose span holds the pointer time can be hit.
 */
export function overlayCurveAt<Overlay extends Live2DMotionOverlay>(
  overlays: readonly Overlay[],
  view: TimelineView,
  geometry: RowGeometry,
  range: ValueRange,
  x: number,
  y: number,
): Overlay | undefined {
  const atMs = xToTime(view, x)
  for (let index = overlays.length - 1; index >= 0; index--) {
    const overlay = overlays[index]!
    if (overlay.points.length === 0 || atMs < overlay.startMs || atMs > overlay.endMs)
      continue
    const [low, high] = range
    const value = Math.min(high, Math.max(low, evaluateLive2DMotionOverlay(overlay, atMs)))
    if (Math.abs(valueToY(range, geometry, value) - y) <= hitTolerancePx.curve)
      return overlay
  }
  return undefined
}

/**
 * The keyframe time and value at a canvas position. The time rounds to whole milliseconds, like the stored keyframes.
 * The value clamps to the track range, so a drag past the graph edge holds the key at the edge.
 *
 * @example
 * keyframeFromPointer({ start: 0, end: 1000, width: 1000 }, { top: 0, height: 100 }, [-1, 1], 250.4, -20)
 * // => { atMs: 250, value: 1 }
 */
export function keyframeFromPointer(
  view: TimelineView,
  geometry: RowGeometry,
  range: ValueRange,
  x: number,
  y: number,
): { atMs: number, value: number } {
  const [low, high] = range
  return {
    atMs: Math.round(xToTime(view, x)),
    value: Math.min(high, Math.max(low, yToValue(range, geometry, y))),
  }
}
