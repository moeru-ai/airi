import type { IntervalColumn, ItemStyle, PointColumn, TimelineRowKind } from '@proj-airi/timeline-canvas'

import type { TimelineItemRef } from './headless'

/**
 * Intervals that draw together, with the item that each one selects. Items arrive in start order.
 *
 * @param Item The item reference that a hit test returns.
 */
export interface IntervalLayer<Item extends TimelineItemRef = TimelineItemRef> {
  column: IntervalColumn
  /** The item of each interval, at the index of the interval in `column`. */
  targets: Item[]
  /** Item labels, only on a row that labels its items. */
  labels?: (string | undefined)[]
  /** A short text at the end of each item, for example its duration. It draws only where it fits. */
  trailing?: (string | undefined)[]
}

/**
 * The canvas content of one row. Layers draw in order, so a later layer covers an earlier one.
 *
 * - `states` holds bands behind everything, for example the states of a state machine.
 * - `layers` holds intervals, from the bottom layer to the top layer.
 * - `points` holds instants, with their items in `pointTargets`.
 *
 * @param Item The item reference that a hit test returns.
 */
export interface RowModel<Item extends TimelineItemRef = TimelineItemRef> {
  states: IntervalLayer<Item>
  layers: IntervalLayer<Item>[]
  points: PointColumn
  pointTargets: Item[]
  /** The styles that the columns point to by index. */
  styles: ItemStyle[]
}

/** One row of `Timeline`. The consumer can add its own fields, and gets the row back in slots and callbacks. */
export interface TimelineRowEntry {
  /** Unique among the rows. Connectors name rows by it. */
  key: string
  /** A `lane` row summarizes other rows. Hover and focus rings show only on `detail` rows. */
  kind: TimelineRowKind
  /** Height in CSS pixels. */
  height: number
  /**
   * Consecutive rows with the same block share one label and no separator line between them, for example the rows
   * of one track with overlapping items. Undefined makes a block of one row.
   */
  block?: string
}

/** A row of `Timeline` with its top in the scroll content, in CSS pixels. */
export interface PlacedRow<Row> {
  row: Row
  top: number
}

/** What a row model reads besides the row. */
export interface RowModelContext {
  /** Clock time now, for styles that depend on it. The model rebuilds once a second while time runs. */
  now?: number
}

/** A vertical line between the centers of two rows at a time, for example a handoff from one lane to another. */
export interface TimelineConnector {
  key: string
  time: number
  /** Row keys. */
  from: string
  to: string
  color: string
  /** Draws faint, for example when it does not relate to the selection. */
  dimmed?: boolean
}

/**
 * A mark behind the rows over the whole height: a shaded range or a line.
 *
 * - `muted` ranges shade time without data, for example gaps.
 * - `warning` ranges shade time with doubtful data, for example a clock jump. Without `to`, they run to now.
 * - `danger` lines mark a moment, for example a lost record.
 */
export type TimelineBackdrop
  = | { kind: 'range', from: number, to?: number, tone: 'muted' | 'warning' }
    | { kind: 'line', time: number, tone: 'danger' }
