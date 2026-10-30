import type { IntervalRun } from './aggregate'
import type { IntervalColumn, PointColumn } from './columns'
import type { ItemGlyph, ItemStyle, RowGeometry } from './draw'
import type { SeriesPyramid } from './series'
import type { TimelineView } from './view'

import { intervalRuns, pointMarks } from './aggregate'
import { drawEnvelope, drawIntervalRuns, drawPointMarks, drawRunLabels, LABEL_BAND_PX, WAVEFORM_BAR_PITCH_PX } from './draw'

/** Geometry of the rows of a timeline, in CSS pixels. */
export const ROW_GEOMETRY = {
  /**
   * Row heights. A row with a waveform is taller, so the waveform has room to read. A hidden track keeps one row of the
   * detail height, so a single-row track does not move the rows under it when it hides or shows.
   */
  height: { lane: 54, detail: 34, content: 62, hidden: 34 },
  /** Height of an item on an entity lane, centered in the row. */
  laneItemHeight: 30,
  /** Space between the edge of a detail row and its items. */
  detailInset: 4,
  /** Space between the edge of an item and a series inside it. */
  contentInset: 4,
  /** Corner radius of the items of each row kind, and of the state bands behind them. */
  radius: { lane: 6, detail: 4, state: 3 },
} as const

/**
 * - `lane`: the summary of an entity. Its items are a fixed height in the middle of the row.
 * - `detail`: one track. Its items fill the row, less an inset.
 */
export type TimelineRowKind = 'lane' | 'detail'

/** Where the items of a row draw, and their corner radius. */
export function rowItemGeometry(kind: TimelineRowKind, top: number, height: number): RowGeometry & { radius: number } {
  return kind === 'lane'
    ? { top: top + (height - ROW_GEOMETRY.laneItemHeight) / 2, height: ROW_GEOMETRY.laneItemHeight, radius: ROW_GEOMETRY.radius.lane }
    : { top: top + ROW_GEOMETRY.detailInset, height: height - ROW_GEOMETRY.detailInset * 2, radius: ROW_GEOMETRY.radius.detail }
}

/** Where the state bands of a row draw: the whole row, less 1 px at the top and the bottom. */
export function stateBandGeometry(top: number, height: number): RowGeometry & { radius: number } {
  return { top: top + 1, height: height - 2, radius: ROW_GEOMETRY.radius.state }
}

/**
 * A series that shows inside the capsules of a row, so a capsule shows what happened during its span.
 *
 * - `waveform`: an audio level as symmetric bars. `intensity`, from 0 to 1, sets the opacity of each bar, for example a
 *   VAD probability. Bars right of `revealX` do not draw yet, so a live waveform grows smoothly.
 * - `chart`: a value as a line in `range`, with an optional dashed `threshold`.
 */
export type CapsuleContent
  = | { kind: 'waveform', level: SeriesPyramid, intensity?: SeriesPyramid, revealX?: number }
    | { kind: 'chart', series: SeriesPyramid, range?: [number, number], threshold?: number }

export interface TimelineRowLayer {
  column: IntervalColumn
  /** The label of an item by its index. Leave it unset when the row name tells what the items are. */
  label?: (index: number) => string | undefined
  /** A short text at the end of an item by its index, for example its duration. */
  trailing?: (index: number) => string | undefined
}

/** Everything that one row draws. Layers draw in order, so a later layer covers an earlier one. */
export interface TimelineRowContent {
  /** Styles by the style index of the columns. */
  styles: readonly ItemStyle[]
  /** State changes, as bands behind the items. */
  states?: IntervalColumn
  layers: TimelineRowLayer[]
  /** Instants that belong to no item. */
  points?: PointColumn
  content?: CapsuleContent
}

export interface TimelineRowFrame {
  view: TimelineView
  kind: TimelineRowKind
  /** The row rectangle, in CSS pixels from the top of the canvas. */
  top: number
  height: number
  /** The trace clock now. Open items end here. */
  now?: number
  /** Milliseconds of a monotonic clock, for the shimmer. */
  time?: number
  /** Label color on soft and hatch items. */
  text?: string
  /** Labels start right of this x, for example right of a label column over the canvas. */
  labelLeft?: number
  /** The paths of the glyph IDs of the styles. See `IntervalDrawOptions.glyphs`. */
  glyphs?: (id: string) => ItemGlyph | undefined
}

/**
 * Draws one row of a timeline: the state bands, the items of each layer, the series inside the items, the labels, and
 * the instants. Returns the drawn runs of the state bands and of each layer, so the caller can mark the drawn items.
 */
export function drawTimelineRow(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, row: TimelineRowContent, frame: TimelineRowFrame): { states: IntervalRun[], layers: IntervalRun[][] } {
  const { view, now } = frame
  const geometry = rowItemGeometry(frame.kind, frame.top, frame.height)
  const shared = { time: frame.time, text: frame.text, glyphs: frame.glyphs }

  const states = row.states && row.states.count > 0 ? intervalRuns(row.states, view, { now }) : []
  if (states.length > 0)
    drawIntervalRuns(ctx, states, row.styles, { ...shared, ...stateBandGeometry(frame.top, frame.height) })

  const runsByLayer = row.layers.map((layer) => {
    if (layer.column.count === 0)
      return []
    const runs = intervalRuns(layer.column, view, { now })
    // With content, the decorations draw after it, so the content does not cover them.
    drawIntervalRuns(ctx, runs, row.styles, { ...shared, ...geometry, label: layer.label, trailing: layer.trailing, labelLeft: frame.labelLeft, decorate: !row.content })
    return runs
  })

  if (row.content) {
    const runs = runsByLayer.flat()
    // A row decorates its items when it labels them, gives trailing text, or can draw glyphs. A style marker decorates
    // too: the retry icon, and the status dot that the content must not cover.
    const decorated = frame.glyphs !== undefined
      || row.layers.some(layer => layer.label !== undefined || layer.trailing !== undefined)
      || runs.some(run => row.styles[run.style]?.icon !== undefined || row.styles[run.style]?.status !== undefined)
    // The decorations take a band at the top, and the content takes the rest, so neither covers the other.
    const band = decorated
      ? { top: geometry.top + LABEL_BAND_PX, height: geometry.height - LABEL_BAND_PX - ROW_GEOMETRY.contentInset }
      : { top: geometry.top + ROW_GEOMETRY.contentInset, height: geometry.height - ROW_GEOMETRY.contentInset * 2 }
    drawCapsuleContent(ctx, row.content, runs, row.styles, { view, clip: geometry, band })
    if (decorated) {
      for (const [index, layer] of row.layers.entries())
        drawRunLabels(ctx, runsByLayer[index]!, row.styles, { ...shared, ...geometry, label: layer.label, trailing: layer.trailing, labelLeft: frame.labelLeft, labelPosition: 'top' })
    }
  }

  if (row.points && row.points.count > 0)
    drawPointMarks(ctx, pointMarks(row.points, view), row.styles, geometry)
  return { states, layers: runsByLayer }
}

/**
 * Draws a series inside the shapes of `runs`. Runs of each style draw on their own, so each item gets a series color that
 * contrasts with it. A row without items draws the series across the whole row, so a track with only a series still
 * shows it.
 */
function drawCapsuleContent(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, content: CapsuleContent, runs: IntervalRun[], styles: readonly ItemStyle[], area: { view: TimelineView, clip: RowGeometry, band: RowGeometry }) {
  if (runs.length === 0) {
    drawSeries(ctx, content, undefined, area)
    return
  }
  const byStyle = Map.groupBy(runs, run => run.style)
  for (const [style, group] of byStyle) {
    ctx.save()
    ctx.beginPath()
    // The series stays on its own times, so the clip is the item shape itself, without padding.
    for (const run of group)
      ctx.rect(run.x0, area.clip.top, run.x1 - run.x0, area.clip.height)
    ctx.clip()
    drawSeries(ctx, content, styles[style], area)
    ctx.restore()
  }
}

function drawSeries(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, content: CapsuleContent, style: ItemStyle | undefined, area: { view: TimelineView, band: RowGeometry }) {
  const { view, band } = area
  // The series takes the ink of the item: white on a solid item by default, else the item color. Without an item, the
  // series is gray.
  const solid = style !== undefined && (style.pattern ?? 'solid') === 'solid'
  const color = solid ? style?.text ?? '#ffffff' : style?.text ?? style?.color ?? '#737373'
  if (content.kind === 'waveform') {
    drawEnvelope(ctx, content.level.envelope(view, WAVEFORM_BAR_PITCH_PX), {
      ...band,
      color,
      columnPx: WAVEFORM_BAR_PITCH_PX,
      mode: 'waveform',
      symmetric: true,
      // The bars read on the solid color, and stay a step behind the striped background, so the ink does not shout.
      opacity: solid ? 0.85 : 0.6,
      bridgePx: content.level.bridgePx(view),
      intensity: content.intensity?.envelope(view, WAVEFORM_BAR_PITCH_PX),
      revealX: content.revealX,
    })
    return
  }
  drawEnvelope(ctx, content.series.envelope(view, 2), {
    ...band,
    color,
    columnPx: 2,
    mode: 'line',
    range: content.range,
    threshold: content.threshold,
    bridgePx: content.series.bridgePx(view),
  })
}
