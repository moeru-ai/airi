import type { ItemStyle, RowGeometry, TimelineView, ValueRange } from '@proj-airi/timeline-canvas'

import type { Live2DMotionEditableTrackId, Live2DMotionKeyframe, Live2DMotionProject } from './keyframes'

import {
  capsuleStyle,
  drawIntervalRuns,
  drawLine,
  IntervalColumn,
  intervalRuns,
  itemRadius,
  strokeItemRing,
  StyleTable,
  timeToX,
  valueToY,
} from '@proj-airi/timeline-canvas'

import {
  getLive2DMotionCompositePoints,
  getLive2DMotionSourcePoints,
  getLive2DMotionTrackRange,
  isLive2DMotionViewTargetTrackId,
} from './keyframes'

/** Overlay colors in project order. The track header and the canvas give one overlay the same color. */
const overlayColors = ['#0ea5e9', '#f59e0b', '#a855f7', '#10b981', '#f43f5e']

/** The color of an overlay by its place in the project, so it stays stable while other tracks change. */
export function motionOverlayColor(project: Live2DMotionProject, overlayId: string): string {
  const index = project.overlays.findIndex(overlay => overlay.id === overlayId)
  return overlayColors[Math.max(0, index) % overlayColors.length]!
}

/** A curve as sorted columns, the input of `drawLine`. */
interface MotionCurve {
  times: Float64Array
  values: Float64Array
}

/**
 * What the canvas draws for one track, built when the project changes. A frame only maps it to the view.
 *
 * - `source`: the recorded track, gray.
 * - `composite`: the track after the overlays, dark.
 * - `overlays`: the keyframe curve of each overlay of the track, in its overlay color.
 * - `spans`: the time span of each overlay as a soft capsule behind the curves.
 */
export interface MotionTrackModel {
  trackId: Live2DMotionEditableTrackId
  range: ValueRange
  /** View-target keys hold until the next key, so their curves are steps. Other tracks interpolate linearly. */
  curve: 'linear' | 'step'
  source: MotionCurve
  composite: MotionCurve
  overlays: { id: string, color: string, curve: MotionCurve }[]
  spans: IntervalColumn
  spanStyles: readonly ItemStyle[]
  /** The capsule label of each span by its index in `spans`. */
  spanLabels: (string | undefined)[]
}

function curveOf(points: readonly Live2DMotionKeyframe[]): MotionCurve {
  return {
    times: Float64Array.from(points, point => point.atMs),
    values: Float64Array.from(points, point => point.value),
  }
}

export function createMotionTrackModel(project: Live2DMotionProject, trackId: Live2DMotionEditableTrackId): MotionTrackModel {
  const viewTarget = isLive2DMotionViewTargetTrackId(trackId)
  const overlays = project.overlays.filter(overlay => overlay.trackId === trackId)
  const styles = new StyleTable()
  const spans = new IntervalColumn()
  const spanLabels: (string | undefined)[] = []
  // The column keeps its items sorted by start. Appends in start order keep each index stable, so the labels match.
  for (const overlay of [...overlays].sort((left, right) => left.startMs - right.startMs)) {
    const color = motionOverlayColor(project, overlay.id)
    spans.append(overlay.startMs, overlay.endMs, styles.index(capsuleStyle({ color, activity: 'thinking' })), overlay.id)
    // A view-target overlay spans the whole motion, so its name tells nothing that the track label does not.
    spanLabels.push(viewTarget ? undefined : `${overlay.name} · ${overlay.blendMode}`)
  }

  return {
    trackId,
    range: getLive2DMotionTrackRange(trackId),
    curve: viewTarget ? 'step' : 'linear',
    source: curveOf(getLive2DMotionSourcePoints(project, trackId)),
    composite: curveOf(getLive2DMotionCompositePoints(project, trackId)),
    overlays: overlays.map(overlay => ({ id: overlay.id, color: motionOverlayColor(project, overlay.id), curve: curveOf(overlay.points) })),
    spans,
    spanStyles: styles.styles,
    spanLabels,
  }
}

/** The theme colors of the canvas. The lanes layer picks the light or the dark set. */
export interface MotionTimelinePalette {
  text: string
  grid: string
  row: string
  activeRow: string
  rowBorder: string
  zero: string
  source: string
  composite: string
  /** The ring around keyframe dots, so a dot reads on a curve of its own color. */
  ring: string
  selection: string
  playhead: string
}

export const motionTimelinePalettes: Record<'light' | 'dark', MotionTimelinePalette> = {
  light: {
    text: '#404040',
    grid: 'rgba(229,229,229,0.9)',
    row: 'rgba(0,0,0,0.02)',
    activeRow: 'rgba(0,0,0,0.045)',
    rowBorder: 'rgba(229,229,229,0.9)',
    zero: '#e5e5e5',
    source: '#a3a3a3',
    composite: '#171717',
    ring: '#ffffff',
    selection: '#0ea5e9',
    playhead: '#f59e0b',
  },
  dark: {
    text: '#e5e5e5',
    grid: 'rgba(64,64,64,0.6)',
    row: 'rgba(23,23,23,0.4)',
    activeRow: 'rgba(255,255,255,0.05)',
    rowBorder: 'rgba(64,64,64,0.35)',
    zero: '#262626',
    source: '#525252',
    composite: '#f5f5f5',
    ring: '#0a0a0a',
    selection: '#38bdf8',
    playhead: '#fbbf24',
  },
}

/** Where a track draws in one frame, in canvas CSS pixels. */
export interface MotionTrackFrame {
  view: TimelineView
  /** The whole row, for its background and the overlay spans. */
  row: RowGeometry
  /** The curve graph inside the row. */
  graph: RowGeometry
  width: number
  /** The width of the label column over the left of the lanes. Capsule labels start right of it. */
  labelLeft: number
}

/** What the editor state adds to a track: the active track shows the keyframes and the edge handles. */
export interface MotionTrackDrawState {
  active: boolean
  selectedOverlayId?: string
}

/**
 * Draws one track: the row background, the overlay spans, the zero line, the source and composite curves, the overlay
 * curves, and on the active track the edge handles and the keyframe dots of the selected overlay.
 */
export function drawMotionTrack(
  ctx: CanvasRenderingContext2D,
  model: MotionTrackModel,
  frame: MotionTrackFrame,
  state: MotionTrackDrawState,
  palette: MotionTimelinePalette,
): void {
  const { view, row, graph } = frame
  ctx.fillStyle = state.active ? palette.activeRow : palette.row
  ctx.fillRect(0, row.top, frame.width, row.height)
  ctx.fillStyle = palette.rowBorder
  ctx.fillRect(0, row.top + row.height - 1, frame.width, 1)

  const spanGeometry = { top: row.top + 2, height: row.height - 5 }
  const runs = intervalRuns(model.spans, view)
  drawIntervalRuns(ctx, runs, model.spanStyles, {
    ...spanGeometry,
    radius: 6,
    label: index => model.spanLabels[index],
    labelPosition: 'top',
    labelLeft: frame.labelLeft,
    text: palette.text,
  })
  const selectedRun = runs.find(run => run.count === 1 && model.spans.keys[run.index] === state.selectedOverlayId)
  if (selectedRun) {
    const radius = itemRadius(selectedRun.x1 - selectedRun.x0, spanGeometry.height, 6)
    strokeItemRing(ctx, { ...selectedRun, ...spanGeometry, radius }, { color: palette.selection, alpha: 0.7 })
  }

  const [low, high] = model.range
  if (low < 0 && high > 0) {
    ctx.fillStyle = palette.zero
    ctx.fillRect(0, Math.round(valueToY(model.range, graph, 0)), frame.width, 1)
  }

  const line = { view, ...graph, range: model.range }
  drawLine(ctx, model.source.times, model.source.values, { ...line, color: palette.source, lineWidth: 2 })
  drawLine(ctx, model.composite.times, model.composite.values, { ...line, color: palette.composite, lineWidth: 2, curve: model.curve })
  for (const overlay of model.overlays) {
    const selected = overlay.id === state.selectedOverlayId
    drawLine(ctx, overlay.curve.times, overlay.curve.values, { ...line, color: overlay.color, lineWidth: selected ? 3.5 : 2, curve: model.curve })
  }

  const selected = state.active ? model.overlays.find(overlay => overlay.id === state.selectedOverlayId) : undefined
  if (!selected)
    return

  const selectedIndex = model.spans.keys.indexOf(selected.id)
  if (model.curve === 'linear' && selectedIndex >= 0) {
    // Edge handles: a 12 px tinted band at each end of the selected overlay, the drag target of its start and end.
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.fillStyle = selected.color
    for (const atMs of [model.spans.starts[selectedIndex]!, model.spans.ends[selectedIndex]!])
      ctx.fillRect(timeToX(view, atMs) - 6, row.top, 12, row.height)
    ctx.restore()
  }

  ctx.save()
  ctx.fillStyle = selected.color
  ctx.strokeStyle = palette.ring
  ctx.lineWidth = 2
  const { times, values } = selected.curve
  for (let index = 0; index < times.length; index++) {
    ctx.beginPath()
    ctx.arc(timeToX(view, times[index]!), valueToY(model.range, graph, values[index]!), 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}
