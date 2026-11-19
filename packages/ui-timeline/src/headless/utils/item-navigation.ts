import type { TimelineItemRef } from '../types'

/**
 * An item of the hidden item list of the timeline: what the keyboard moves between.
 *
 * @param Item The item reference that a selection holds.
 */
export interface ListedItem<Item extends TimelineItemRef = TimelineItemRef> {
  target: Item
  /** The text of the item button for screen readers. */
  label: string
  /** Index of the row of the item. Rows above have smaller indexes. */
  row: number
  start: number
  /** Undefined while the item runs. */
  end?: number
}

/** A keyboard move between items. */
export type ItemMove = 'previous' | 'next' | 'first' | 'last' | 'up' | 'down'

/** The move of each key. Other keys move nothing. */
export const ITEM_MOVE_KEYS: Readonly<Record<string, ItemMove>> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  Home: 'first',
  End: 'last',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

/** The time distance from a point to an item. 0 when the item covers the point. */
function distance(time: number, item: ListedItem): number {
  if (time < item.start)
    return item.start - time
  const end = item.end ?? Number.POSITIVE_INFINITY
  return time > end ? time - end : 0
}

/**
 * The item that a keyboard move from `from` goes to, or undefined at an edge.
 *
 * Left and right go to the previous and next item of the same row, in start order. Up and down go to the nearest row
 * above or below that has items, to the item nearest in time to the start of `from`.
 *
 * @example
 * neighborItem(items, items[0], 'next')
 * // => the item after items[0] in its row
 */
export function neighborItem<Item extends TimelineItemRef>(items: readonly ListedItem<Item>[], from: ListedItem<Item>, move: ItemMove): ListedItem<Item> | undefined {
  if (move === 'up' || move === 'down') {
    let row: number | undefined
    for (const item of items) {
      const beyond = move === 'up' ? item.row < from.row : item.row > from.row
      const nearer = row === undefined || (move === 'up' ? item.row > row : item.row < row)
      if (beyond && nearer)
        row = item.row
    }
    let best: ListedItem<Item> | undefined
    for (const item of items) {
      if (item.row === row && (!best || distance(from.start, item) < distance(from.start, best)))
        best = item
    }
    return best
  }

  const row = items.filter(item => item.row === from.row).sort((a, b) => a.start - b.start)
  const index = row.findIndex(item => item.target.key === from.target.key)
  switch (move) {
    case 'previous':
      return index > 0 ? row[index - 1] : undefined
    case 'next':
      return index >= 0 ? row[index + 1] : undefined
    case 'first':
      return row[0]?.target.key === from.target.key ? undefined : row[0]
    case 'last':
      return row.at(-1)?.target.key === from.target.key ? undefined : row.at(-1)
  }
}
