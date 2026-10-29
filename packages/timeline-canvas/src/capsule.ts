import type { ItemStyle } from './draw'

/** Colors of the capsule states that do not come from the item. */
export const CAPSULE_COLORS = {
  /** The failure dot and failure text. */
  failed: '#ef4444',
  /** A failed capsule keeps its own color under this tint and this outline. */
  failedOverlay: 'rgba(239,68,68,0.12)',
  failedStroke: 'rgba(239,68,68,0.35)',
  overdue: '#f59e0b',
  abandoned: '#a3a3a3',
} as const

/**
 * What a capsule shows about its span. {@link capsuleStyle} turns it into an {@link ItemStyle}, so the IO tracer and
 * its stories give the same state the same look.
 */
export interface CapsuleState {
  color: string
  /**
   * - `active`: work that produces output, such as speaking. Solid.
   * - `thinking`: work that waits for a model, such as a request. A soft tint.
   * - `waiting`: work that waits for something else, such as a queue. Stripes.
   * @default 'active'
   */
  activity?: 'active' | 'thinking' | 'waiting'
  /** The glyph ID of the item kind, for example the icon of its track. See `ItemStyle.glyph`. */
  glyph?: string
  /** The span has not ended. Thinking and waiting work then sweeps a shimmer. */
  open?: boolean
  /** The span ended with an error: its own color under a faint red tint, a faint red outline, and a red status dot. */
  failed?: boolean
  /** The span retries an earlier span: a circular arrow. */
  retry?: boolean
  /** The span was cancelled: faded. */
  cancelled?: boolean
  /** The span never ended and its source is gone: a gray outline. */
  abandoned?: boolean
  /** The open span passed its deadline: an amber outline. */
  overdue?: boolean
  /** The span is not related to the selection: strongly faded. */
  dimmed?: boolean
}

/**
 * The style of a capsule in a state.
 *
 * @example
 * capsuleStyle({ color: '#3b82f6', activity: 'thinking', failed: true })
 * // => { color: '#3b82f6', pattern: 'soft', overlay: 'rgba(239,68,68,0.12)', stroke: 'rgba(239,68,68,0.35)', status: 'failed' }
 */
export function capsuleStyle(state: CapsuleState): ItemStyle {
  const activity = state.activity ?? 'active'
  const pattern = activity === 'thinking' ? 'soft' : activity === 'waiting' ? 'hatch' : 'solid'
  const style: ItemStyle = { color: state.color, pattern }
  if (state.glyph)
    style.glyph = state.glyph
  if (state.failed) {
    style.overlay = CAPSULE_COLORS.failedOverlay
    style.status = 'failed'
  }
  const stroke = state.failed ? CAPSULE_COLORS.failedStroke : state.overdue ? CAPSULE_COLORS.overdue : state.abandoned ? CAPSULE_COLORS.abandoned : undefined
  if (stroke)
    style.stroke = stroke
  if (state.open && !state.abandoned && pattern !== 'solid')
    style.shimmer = true
  const opacity = state.dimmed ? 0.25 : state.cancelled ? 0.55 : undefined
  if (opacity !== undefined)
    style.opacity = opacity
  if (state.retry)
    style.icon = 'retry'
  return style
}

/**
 * The layers of an entity lane, in draw order. Active work covers thinking and waiting, and failures cover everything,
 * so a failure always shows.
 */
export const LANE_LAYERS = ['waiting', 'thinking', 'active', 'failed'] as const

export type LaneLayer = typeof LANE_LAYERS[number]

/** The layer of a capsule on an entity lane. */
export function laneLayerOf(state: CapsuleState): LaneLayer {
  return state.failed ? 'failed' : state.activity ?? 'active'
}

/**
 * The style of a capsule on an entity lane. A failure keeps the color of its work under the red tint, and its layer
 * draws last, so it shows over other work. A lane draws no icons and no glyphs: the rows of its tracks show the same
 * items with them. It keeps the status dot.
 */
export function laneCapsuleStyle(state: CapsuleState): ItemStyle {
  const { icon: _icon, glyph: _glyph, ...style } = capsuleStyle(state)
  return style
}

/**
 * A table that stores each distinct style once, so columns store small style indices.
 *
 * @example
 * const table = new StyleTable()
 * table.index({ color: 'red' }) === table.index({ color: 'red' })
 * // => true
 */
export class StyleTable {
  readonly styles: ItemStyle[] = []
  private readonly indices = new Map<string, number>()

  index(style: ItemStyle): number {
    const key = `${style.color}|${style.pattern}|${style.stroke}|${style.text}|${style.shimmer}|${style.opacity}|${style.icon}|${style.glyph}|${style.status}|${style.overlay}`
    let index = this.indices.get(key)
    if (index === undefined) {
      index = this.styles.length
      this.styles.push(style)
      this.indices.set(key, index)
    }
    return index
  }
}
