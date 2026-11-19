/**
 * A reference to an item of the timeline, for example a selection or a hovered item.
 *
 * The timeline compares items by `key` only. It does not read `kind`, and it passes the whole reference back in its
 * events, so a consumer can keep its own item kinds there.
 */
export interface TimelineItemRef {
  key: string
  kind?: string
}

/** A time range on the clock of the timeline, in milliseconds. */
export interface TimelineRange {
  from: number
  to: number
}
