import type { TimelineView } from '@proj-airi/timeline-canvas'
import type { TimelineItemRef } from '@proj-airi/ui-timeline/headless'

import type { Live2DMotionEditableTrackId, Live2DMotionProject } from './keyframes'

import { xToTime } from '@proj-airi/timeline-canvas'
import { scaleLinear } from 'd3'

import { getLive2DMotionTrackRange } from './keyframes'

/** Row heights of the motion timeline. The active track expands, so its curve has room for keyframe edits. */
export const motionTrackHeights = { active: 300, idle: 64 } as const

/** Space between the edge of a track row and its graph, so a keyframe dot at the edge of the range shows whole. */
const GRAPH_INSET_PX = 12

/**
 * Space at each end of the full view. A keyframe at time 0 or at the end of the motion then shows whole, clear of the
 * label column.
 */
const VIEW_PADDING_PX = 12

/** Overlay colors in project order. The track header and the lanes give one overlay the same color. */
const overlayColors = ['#0ea5e9', '#f59e0b', '#a855f7', '#10b981', '#f43f5e']

/** The color of an overlay by its place in the project, so it stays stable while other tracks change. */
export function motionOverlayColor(project: Live2DMotionProject, overlayId: string): string {
  const index = project.overlays.findIndex(overlay => overlay.id === overlayId)
  return overlayColors[Math.max(0, index) % overlayColors.length]!
}

/** An overlay of the motion timeline. A selected item selects its overlay in the editor. */
export interface MotionTimelineItem extends TimelineItemRef {
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

/** The y offset of a track value inside its row: the high end of the range at the top, the low end at the bottom. */
export function motionValueScale(row: MotionTrackRow) {
  return scaleLinear()
    .domain(getLive2DMotionTrackRange(row.trackId))
    .range([row.height - GRAPH_INSET_PX, GRAPH_INSET_PX])
    .clamp(true)
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
