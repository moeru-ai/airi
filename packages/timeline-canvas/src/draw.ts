import type { IntervalRun, PointMark } from './aggregate'
import type { Envelope } from './series'
import type { ValueRange } from './value'
import type { TimelineView } from './view'

import { CAPSULE_COLORS } from './capsule'
import { lowerBound, upperBound } from './search'
import { waveformColumns } from './series'
import { valueToY } from './value'
import { timeToX } from './view'

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * How an interval or a point draws. A lane keeps a table of styles and stores an index for each item.
 *
 * Patterns follow the trace activity of an item:
 * - `solid`: active work, such as speaking or a tool call.
 * - `soft`: thinking, such as a model request. A light tint of the color.
 * - `hatch`: waiting, such as a queued request. Diagonal stripes.
 */
export interface ItemStyle {
  color: string
  pattern?: 'solid' | 'soft' | 'hatch'
  /** A thin outline, for example a faint red for a failed item. */
  stroke?: string
  /** A tint over the fill, for example a faint red for a failed item. The item keeps its own color under it. */
  overlay?: string
  /**
   * Ink of the label, the trailing text, and, on a solid item, the glyph and the series. Give a dark ink for a light solid
   * color. @default white on solid, `IntervalDrawOptions.text` on soft and hatch
   */
  text?: string
  /** An open item sweeps a light band, like a progress bar, while it waits for its first response. */
  shimmer?: boolean
  /** Opacity of the whole item, for example for a cancelled item. @default 1 */
  opacity?: number
  /** A mark of the item kind: `retry` is a circular arrow. It takes the place of the glyph. */
  icon?: ItemIcon
  /**
   * The ID of a glyph that draws at the start of the item, for example the icon of its track.
   * `IntervalDrawOptions.glyphs` gives the paths of the ID.
   */
  glyph?: string
  /** A status dot in the top left corner: red for a failed item. */
  status?: ItemStatus
}

export type ItemIcon = 'retry'

export type ItemStatus = 'failed'

/** One path of a glyph, in a 24 px box, like the paths of an icon set. */
export interface GlyphPath {
  d: string
  fill: boolean
  stroke: boolean
  /** Stroke width in the 24 px box. @default 2 */
  width?: number
  cap?: CanvasLineCap
  join?: CanvasLineJoin
}

/** A small picture that an item draws at its start. */
export interface ItemGlyph {
  paths: GlyphPath[]
}

/**
 * Width in CSS pixels over which new waveform bars grow to their height. A reveal edge this far right of the newest
 * sample shows every bar whole.
 */
export const WAVEFORM_REVEAL_PX = 18

/** How far a bar has grown, from 0 to 1, by its distance left of the reveal edge, with an ease out. */
function revealGrowth(distancePx: number): number {
  if (distancePx < 0)
    return 0
  const progress = Math.min(1, distancePx / WAVEFORM_REVEAL_PX)
  return 1 - (1 - progress) ** 3
}

/** The narrowest gap that a series always bridges, so a comb of single samples does not show. */
const MIN_BRIDGE_PX = 12

/** Size of an item icon in CSS pixels. */
const ICON_PX = 14

export interface RowGeometry {
  /** CSS pixels from the top of the canvas. */
  top: number
  height: number
}

export interface IntervalDrawOptions extends RowGeometry {
  /** Corner radius in CSS pixels. Narrow items get a smaller radius. @default 5 */
  radius?: number
  /** The label of an interval by its index. A run of several intervals has no label. */
  label?: (index: number) => string | undefined
  /** CSS font of the labels. @default {@link LABEL_FONT} */
  font?: string
  /** Milliseconds of a monotonic clock, for the shimmer animation. */
  time?: number
  /** Label color on soft and hatch items, which are light. Give a color that contrasts with the page. @default '#404040' */
  text?: string
  /**
   * Where the label sits. `middle` centers it in the item. `top` puts it in a band at the top, so a waveform can use
   * the rest of the item without passing under the text. See {@link LABEL_BAND_PX}. @default 'middle'
   */
  labelPosition?: 'middle' | 'top'
  /**
   * The leftmost x of a label. A view that covers the left of the canvas, for example with a label column, gives its
   * width, so the label of an item that starts under it moves into view. @default 0
   */
  labelLeft?: number
  /** The paths of a glyph ID of `ItemStyle.glyph`. An ID without paths draws nothing, for example while they load. */
  glyphs?: (id: string) => ItemGlyph | undefined
  /** A short text at the end of an item by its index, for example its duration. It draws only where it fits. */
  trailing?: (index: number) => string | undefined
  /**
   * Draw the glyphs, labels, and trailing texts in this call. A row with content draws them after the content, so the
   * content does not cover them. @default true
   */
  decorate?: boolean
}

/** The font of the trailing text of an item. */
const TRAILING_FONT = '500 10px system-ui, sans-serif'

/** The label font of every item. Semibold, so it reads on a colored shape. */
export const LABEL_FONT = '600 11px system-ui, sans-serif'

/** Height of the top band that holds a label at `labelPosition: 'top'`, with room above the text. Content under it starts this far down. */
export const LABEL_BAND_PX = 21

const LABEL_PADDING_PX = 5

/**
 * The pitch of waveform bars: a 1.5 px bar and a 1.5 px gap. The bar is about half the stroke of the label font. Read
 * the envelope with this `columnPx` for a waveform.
 */
export const WAVEFORM_BAR_PITCH_PX = 3
const SHIMMER_PERIOD_MS = 1400
const SHIMMER_BAND_PX = 64
const SHIMMER_ALPHA = 0.45

const rgbCache = new Map<string, string>()

/**
 * A CSS color with an alpha. The canvas normalizes the color, so any CSS color works.
 * Both ends of a gradient get the same color with alpha 0, because a transparent black end darkens the band.
 */
function withAlpha(ctx: Context2D, color: string, alpha: number): string {
  let rgb = rgbCache.get(color)
  if (rgb === undefined) {
    const previous = ctx.fillStyle
    ctx.fillStyle = color
    const normalized = String(ctx.fillStyle)
    ctx.fillStyle = previous
    const hex = /^#([0-9a-f]{6})$/i.exec(normalized)?.[1]
    rgb = hex
      ? [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(',')
      : (/^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(normalized)?.slice(1, 4).join(',') ?? '255,255,255')
    rgbCache.set(color, rgb)
  }
  return `rgba(${rgb},${alpha})`
}

const hatchPatterns = new Map<string, CanvasPattern | null>()

function hatchPattern(ctx: Context2D, color: string): CanvasPattern | null {
  const cached = hatchPatterns.get(color)
  if (cached !== undefined)
    return cached
  if (typeof OffscreenCanvas === 'undefined')
    return null
  const tile = new OffscreenCanvas(8, 8)
  const tileContext = tile.getContext('2d')
  if (!tileContext)
    return null
  tileContext.strokeStyle = color
  tileContext.globalAlpha = 0.55
  tileContext.lineWidth = 2
  tileContext.beginPath()
  tileContext.moveTo(-2, 10)
  tileContext.lineTo(10, -2)
  tileContext.moveTo(6, 10)
  tileContext.lineTo(10, 6)
  tileContext.moveTo(-2, 2)
  tileContext.lineTo(2, -2)
  tileContext.stroke()
  const pattern = ctx.createPattern(tile, 'repeat')
  hatchPatterns.set(color, pattern)
  return pattern
}

function capsulePath(ctx: Context2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, r)
}

/** The corner radius that an item of this size draws with, for an `IntervalDrawOptions.radius` of `radius`. */
export function itemRadius(width: number, height: number, radius = 5): number {
  return Math.max(0, Math.min(width < 6 ? 1.5 : radius, width / 2, height / 2))
}

export interface ItemRingOptions {
  color: string
  /** @default 2 */
  width?: number
  /** Pixels between the edge of the item and the inside of the ring. @default 1 */
  offset?: number
  dash?: number[]
  alpha?: number
}

/**
 * Strokes a ring around an item, for example for hover, focus, or selection. The ring follows the corners of the item:
 * its radius is the item radius plus its distance from the item.
 */
export function strokeItemRing(ctx: Context2D, item: { x0: number, x1: number, top: number, height: number, radius: number }, options: ItemRingOptions): void {
  const width = options.width ?? 2
  const distance = (options.offset ?? 1) + width / 2
  ctx.save()
  ctx.strokeStyle = options.color
  ctx.globalAlpha = options.alpha ?? 1
  ctx.lineWidth = width
  ctx.setLineDash(options.dash ?? [])
  ctx.beginPath()
  ctx.roundRect(item.x0 - distance, item.top - distance, item.x1 - item.x0 + distance * 2, item.height + distance * 2, item.radius + distance)
  ctx.stroke()
  ctx.restore()
}

/** Draws the runs of one interval row. Runs draw in order, so a later run covers an earlier one. */
export function drawIntervalRuns(ctx: Context2D, runs: IntervalRun[], styles: readonly ItemStyle[], options: IntervalDrawOptions): void {
  const radius = options.radius ?? 5
  const font = options.font ?? LABEL_FONT
  const { top, height } = options
  ctx.save()
  ctx.font = font
  ctx.textBaseline = 'middle'

  for (const run of runs) {
    const style = styles[run.style]
    if (!style)
      continue
    const width = run.x1 - run.x0
    const pattern = style.pattern ?? 'solid'
    ctx.globalAlpha = (style.opacity ?? 1) * (run.count > 1 ? 0.85 : 1)

    capsulePath(ctx, run.x0, top, width, height, itemRadius(width, height, radius))
    if (pattern === 'solid') {
      ctx.fillStyle = style.color
      ctx.fill()
    }
    else if (pattern === 'soft') {
      ctx.fillStyle = style.color
      ctx.globalAlpha *= 0.32
      ctx.fill()
      ctx.globalAlpha /= 0.32
    }
    else {
      // The base tint gives the stripes and the content of the item a background to read on.
      ctx.fillStyle = style.color
      ctx.globalAlpha *= 0.22
      ctx.fill()
      ctx.globalAlpha /= 0.22
      const hatch = hatchPattern(ctx, style.color)
      if (hatch) {
        ctx.fillStyle = hatch
        ctx.fill()
      }
    }

    if (style.overlay) {
      ctx.fillStyle = style.overlay
      ctx.fill()
    }

    if (run.open && style.shimmer && options.time !== undefined && width > 8) {
      // The light band moves left to right through the item and starts again after each period.
      const phase = (options.time % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS
      const bandX = run.x0 - SHIMMER_BAND_PX + phase * (width + SHIMMER_BAND_PX * 2)
      // The band is the item color, so it reads as the item pulsing, not as a white highlight on top of it.
      const gradient = ctx.createLinearGradient(bandX, 0, bandX + SHIMMER_BAND_PX, 0)
      gradient.addColorStop(0, withAlpha(ctx, style.color, 0))
      gradient.addColorStop(0.5, withAlpha(ctx, style.color, SHIMMER_ALPHA))
      gradient.addColorStop(1, withAlpha(ctx, style.color, 0))
      ctx.save()
      ctx.clip()
      ctx.fillStyle = gradient
      ctx.fillRect(run.x0, top, width, height)
      ctx.restore()
    }

    if (style.stroke) {
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = 1
      capsulePath(ctx, run.x0 + 0.5, top + 0.5, width - 1, height - 1, width < 6 ? 1 : radius - 0.5)
      ctx.stroke()
    }

    if (style.status === 'failed' && run.count === 1 && width >= 8 && height >= 8)
      drawStatusDot(ctx, run.x0, top)
  }
  ctx.restore()
  if (options.decorate ?? true)
    drawRunLabels(ctx, runs, styles, options)
}

/** A red dot with a white ring in the top left corner of an item, inside its rounded corner. */
function drawStatusDot(ctx: Context2D, x0: number, top: number) {
  ctx.save()
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(x0 + 5, top + 5, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x0 + 5, top + 5, 2.5, 0, Math.PI * 2)
  ctx.fillStyle = CAPSULE_COLORS.failed
  ctx.fill()
  ctx.restore()
}

/**
 * The retry glyph: the `refresh-2-line` icon of MingCute (Apache-2.0 license), the icon set of the tracer UI, in a
 * 24 px box.
 */
const RETRY_GLYPH: ItemGlyph = {
  paths: [{ d: 'M3.811 8.264A9 9 0 0 1 14.33 3.307a9 9 0 0 1 6.672 8.622c0 .08-.088.126-.154.082l-2.678-1.804c-.091-.062-.03-.205.078-.181L20 10.41m.189 5.327c-1.789 3.932-6.208 6.112-10.519 4.956a9 9 0 0 1-6.672-8.622c0-.08.088-.126.154-.082l2.678 1.805c.091.061.03.204-.078.18L4 13.59', fill: false, stroke: true, width: 2.25, cap: 'round', join: 'round' }],
}

/** Compiled paths of each glyph. A glyph compiles one time. */
const compiledGlyphs = new WeakMap<ItemGlyph, Path2D[]>()

/** Draws a glyph centered at `x`, `y`, at {@link ICON_PX}, so it stays sharp at any pixel ratio. */
function drawGlyph(ctx: Context2D, glyph: ItemGlyph, x: number, y: number, color: string) {
  let paths = compiledGlyphs.get(glyph)
  if (!paths) {
    paths = glyph.paths.map(path => new Path2D(path.d))
    compiledGlyphs.set(glyph, paths)
  }
  ctx.save()
  ctx.translate(x - ICON_PX / 2, y - ICON_PX / 2)
  ctx.scale(ICON_PX / 24, ICON_PX / 24)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  for (const [index, path] of glyph.paths.entries()) {
    if (path.fill)
      ctx.fill(paths[index]!)
    if (path.stroke) {
      ctx.lineWidth = path.width ?? 2
      ctx.lineCap = path.cap ?? 'butt'
      ctx.lineJoin = path.join ?? 'miter'
      ctx.stroke(paths[index]!)
    }
  }
  ctx.restore()
}

/**
 * Draws what an item shows at its start and its end: the glyph or the icon, the label, and the trailing text. The
 * glyph comes first, then the label, then the trailing text at the right end. A part that does not fit is left out,
 * the trailing text first.
 */
export function drawRunLabels(ctx: Context2D, runs: IntervalRun[], styles: readonly ItemStyle[], options: IntervalDrawOptions): void {
  const { top, height } = options
  const y = options.labelPosition === 'top' ? top + LABEL_BAND_PX / 2 + 1.5 : top + height / 2 + 0.5
  ctx.save()
  ctx.textBaseline = 'middle'
  for (const run of runs) {
    const style = styles[run.style]
    if (!style || run.count !== 1)
      continue
    // Only the part of the item right of `labelLeft` can hold the decorations.
    const left = Math.max(run.x0, options.labelLeft ?? 0)
    const right = run.x1 - LABEL_PADDING_PX
    if (right - left < ICON_PX + LABEL_PADDING_PX)
      continue
    const solid = (style.pattern ?? 'solid') === 'solid'
    const ink = style.text ?? (solid ? '#ffffff' : options.text ?? '#404040')
    ctx.globalAlpha = style.opacity ?? 1

    let cursor = left + LABEL_PADDING_PX
    const glyph = style.icon === 'retry' ? RETRY_GLYPH : style.glyph ? options.glyphs?.(style.glyph) : undefined
    if (glyph) {
      // A solid item draws the glyph in its ink. A light item uses its ink too when the style gives one, else its color.
      drawGlyph(ctx, glyph, cursor + ICON_PX / 2, y - 0.5, solid || style.icon === 'retry' ? ink : style.text ?? style.color)
      cursor += ICON_PX + 4
    }

    ctx.font = options.font ?? LABEL_FONT
    const label = options.label?.(run.index)
    const labelWidth = label ? ctx.measureText(label).width : 0
    ctx.font = TRAILING_FONT
    const trailing = options.trailing?.(run.index)
    const trailingWidth = trailing ? ctx.measureText(trailing).width : 0
    // The trailing text draws only when the whole label fits next to it.
    const showTrailing = trailing !== undefined && cursor + (label ? labelWidth + 8 : 0) + trailingWidth <= right

    // A soft shadow keeps white text readable on a light solid color. A style with its own ink needs none.
    const shadow = solid && style.text === undefined
    ctx.shadowColor = shadow ? 'rgba(0,0,0,0.3)' : 'transparent'
    ctx.shadowBlur = shadow ? 2 : 0
    if (label) {
      ctx.font = options.font ?? LABEL_FONT
      const fitted = fitText(ctx, label, right - cursor - (showTrailing ? trailingWidth + 8 : 0))
      if (fitted) {
        ctx.fillStyle = ink
        ctx.fillText(fitted, cursor, y)
      }
    }
    if (showTrailing) {
      ctx.font = TRAILING_FONT
      ctx.fillStyle = ink
      ctx.globalAlpha = (style.opacity ?? 1) * (solid ? 0.85 : 0.7)
      ctx.textAlign = 'right'
      ctx.fillText(trailing, right, y)
      ctx.textAlign = 'left'
    }
  }
  ctx.restore()
}

/** The longest prefix of `text` with an ellipsis that fits `width`, or undefined when not even one character fits. */
export function fitText(ctx: Pick<Context2D, 'measureText'>, text: string, width: number): string | undefined {
  if (ctx.measureText(text).width <= width)
    return text
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = (low + high + 1) >>> 1
    if (ctx.measureText(`${text.slice(0, middle)}…`).width <= width)
      low = middle
    else
      high = middle - 1
  }
  return low > 0 ? `${text.slice(0, low)}…` : undefined
}

/** Draws the marks of one point row: a dot for each point, or a histogram bar for each bucket. */
export function drawPointMarks(ctx: Context2D, marks: PointMark[], styles: readonly ItemStyle[], options: RowGeometry & { maxCount?: number }): void {
  const { top, height } = options
  const middle = top + height / 2
  const maxCount = options.maxCount ?? marks.reduce((max, mark) => mark.kind === 'bucket' ? Math.max(max, mark.count) : max, 1)
  ctx.save()
  for (const mark of marks) {
    const style = styles[mark.style]
    if (!style)
      continue
    ctx.globalAlpha = style.opacity ?? 1
    ctx.fillStyle = style.color
    if (mark.kind === 'point') {
      ctx.beginPath()
      ctx.arc(mark.x, middle, Math.min(3, height / 2 - 1), 0, Math.PI * 2)
      ctx.fill()
      if (style.stroke) {
        ctx.strokeStyle = style.stroke
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
    else {
      // Log scale, so one busy bucket does not flatten the others.
      const barHeight = Math.max(2, (height - 2) * Math.log2(1 + mark.count) / Math.log2(1 + maxCount))
      ctx.fillRect(mark.x0, top + height - barHeight, Math.max(1, mark.x1 - mark.x0 - 1), barHeight)
    }
  }
  ctx.restore()
}

export interface EnvelopeDrawOptions extends RowGeometry {
  color: string
  /** Pixels for each envelope column. Must match the `columnPx` of the envelope. @default 1 */
  columnPx?: number
  /**
   * - `waveform`: a filled band from the minimum to the maximum of each column, centered for audio samples.
   * - `line`: a line through the column maximums, for a level such as a VAD probability.
   */
  mode: 'waveform' | 'line'
  /** The value range that the row height shows. @default [-1, 1] for waveform, [0, 1] for line */
  range?: [number, number]
  /** A horizontal guide, for example a VAD threshold. */
  threshold?: number
  /**
   * In `waveform` mode, the width of a bar. Each column draws one bar in its middle, so `columnPx` is the bar pitch.
   * Every sample inside a column joins its bar. @default half of `columnPx`
   */
  barWidthPx?: number
  /** In `waveform` mode, how much each bar blends with its neighbors. See {@link waveformColumns}. @default 0.3 */
  smoothing?: number
  /**
   * In `waveform` mode, a series from 0 to 1 that sets the opacity of each bar, read with the same `columnPx`. For
   * example a VAD probability: bars of speech stay solid, and bars of noise fade to {@link intensityFloor}.
   */
  intensity?: Envelope
  /** The opacity factor of a bar where `intensity` is 0. @default 0.25 */
  intensityFloor?: number
  /**
   * In `waveform` mode, the x where new bars appear. Bars right of it do not draw, and bars just left of it grow
   * from a dot to their height, so a live waveform grows smoothly instead of in chunks. @default no limit
   */
  revealX?: number
  /**
   * Draw a waveform of a non-negative level around the middle of the row, from `-max` to `max`, like an audio editor.
   * The range then is `[0, high]`. @default false
   */
  symmetric?: boolean
  /** Width of the line in `line` mode. @default 1.5 */
  lineWidth?: number
  /** Opacity of the waveform. @default 0.85 */
  opacity?: number
  /**
   * A gap of empty columns narrower than this many pixels joins the values around it: a line goes straight across it,
   * and waveform bars take the linear interpolation. A wider gap breaks the shape. Pass `SeriesPyramid.bridgePx`, so
   * a slow series still draws as one shape. The bridge is never narrower than 12 px.
   */
  bridgePx?: number
}

/** Draws an envelope of a series inside one row. Columns without samples leave gaps. */
export function drawEnvelope(ctx: Context2D, envelope: Envelope, options: EnvelopeDrawOptions): void {
  const columnPx = options.columnPx ?? 1
  const [low, high] = options.range ?? (options.mode === 'waveform' && !options.symmetric ? [-1, 1] : [0, 1])
  const { top, height } = options
  const y = (value: number) => valueToY([low, high], options, Math.min(high, Math.max(low, value)))

  ctx.save()
  ctx.fillStyle = options.color
  ctx.strokeStyle = options.color
  const bridgeColumns = Math.max(1, Math.ceil(Math.max(MIN_BRIDGE_PX, options.bridgePx ?? 0) / columnPx))

  if (options.mode === 'waveform') {
    ctx.globalAlpha = options.opacity ?? 0.85
    const middle = top + height / 2
    const barWidth = Math.min(options.barWidthPx ?? columnPx / 2, columnPx)
    const gap = columnPx - barWidth
    const values = waveformColumns(envelope, { bridgeColumns, smoothing: options.smoothing })
    const opacity = options.opacity ?? 0.85
    const floor = options.intensityFloor ?? 0.25
    const intensity = options.intensity ? waveformColumns(options.intensity, { bridgeColumns, smoothing: 0 }) : undefined
    for (let column = 0; column < values.length; column++) {
      const value = values[column]
      if (value === undefined)
        continue
      if (intensity) {
        const level = Math.min(1, Math.max(0, intensity[column]?.max ?? 0))
        ctx.globalAlpha = opacity * (floor + (1 - floor) * level)
      }
      const growth = options.revealX === undefined ? 1 : revealGrowth(options.revealX - (column + 1) * columnPx)
      if (growth <= 0)
        break
      const x = column * columnPx + gap / 2
      if (options.symmetric) {
        const half = Math.max(0.75, (Math.min(high, Math.max(0, value.max)) / (high || 1)) * height / 2 * growth)
        ctx.beginPath()
        ctx.roundRect(x, middle - half, barWidth, half * 2, barWidth / 2)
        ctx.fill()
        continue
      }
      const y0 = y(value.max)
      const y1 = y(value.min)
      ctx.fillRect(x, y0, barWidth, Math.max(1, y1 - y0))
    }
  }
  else {
    ctx.lineWidth = options.lineWidth ?? 1.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    let lastColumn = Number.NEGATIVE_INFINITY
    for (let column = 0; column < envelope.maxs.length; column++) {
      const max = envelope.maxs[column]!
      if (Number.isNaN(max))
        continue
      const x = column * columnPx + columnPx / 2
      // A short gap joins the points around it. A long gap starts a new line.
      if (column - lastColumn <= bridgeColumns)
        ctx.lineTo(x, y(max))
      else
        ctx.moveTo(x, y(max))
      lastColumn = column
    }
    ctx.stroke()
  }

  if (options.threshold !== undefined) {
    ctx.globalAlpha = 0.6
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.beginPath()
    const thresholdY = Math.round(y(options.threshold)) + 0.5
    ctx.moveTo(0, thresholdY)
    ctx.lineTo(envelope.mins.length * columnPx, thresholdY)
    ctx.stroke()
  }
  ctx.restore()
}

export interface LineDrawOptions extends RowGeometry {
  view: TimelineView
  color: string
  /** The value range that the row height shows. Values outside it draw at the edge of the row. @default [0, 1] */
  range?: ValueRange
  /**
   * - `linear`: a straight segment between two points.
   * - `step`: each value holds until the time of the next point, then the line jumps to the next value.
   * @default 'linear'
   */
  curve?: 'linear' | 'step'
  /** @default 1.5 */
  lineWidth?: number
  /** @default 1 */
  opacity?: number
}

/**
 * Draws a line through sparse points of a series, for example the keyframes of a curve. `times` must be sorted.
 *
 * The line includes the nearest point outside each side of the view, so a segment that crosses the view edge still
 * draws when no point is inside the view. Use {@link drawEnvelope} for a dense series, where many samples share a pixel.
 */
export function drawLine(ctx: Context2D, times: ArrayLike<number>, values: ArrayLike<number>, options: LineDrawOptions): void {
  const count = Math.min(times.length, values.length)
  if (count === 0)
    return
  const range = options.range ?? [0, 1]
  const [low, high] = range
  const first = Math.max(0, lowerBound(times, count, options.view.start) - 1)
  const last = Math.min(count - 1, upperBound(times, count, options.view.end))
  const x = (index: number) => timeToX(options.view, times[index]!)
  const y = (index: number) => valueToY(range, options, Math.min(high, Math.max(low, values[index]!)))

  ctx.save()
  ctx.globalAlpha = options.opacity ?? 1
  ctx.strokeStyle = options.color
  ctx.lineWidth = options.lineWidth ?? 1.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x(first), y(first))
  for (let index = first + 1; index <= last; index++) {
    if (options.curve === 'step')
      ctx.lineTo(x(index), y(index - 1))
    ctx.lineTo(x(index), y(index))
  }
  ctx.stroke()
  ctx.restore()
}
