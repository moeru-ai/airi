import type { ListedItem } from './item-navigation'

import { describe, expect, it } from 'vitest'

import { neighborItem } from './item-navigation'

function item(key: string, row: number, start: number, end?: number): ListedItem {
  return { target: { kind: 'span', key }, label: key, row, start, end }
}

describe('neighborItem', () => {
  // Row 0: a [0, 100], b [200, 300]. Row 2: c [150, 250], d [400, 500]. Row 1 has no listed items.
  const items = [item('b', 0, 200, 300), item('a', 0, 0, 100), item('c', 2, 150, 250), item('d', 2, 400, 500)]
  const [b, a, c, d] = items as [ListedItem, ListedItem, ListedItem, ListedItem]

  it('moves within a row in start order, and stops at its edges', () => {
    expect(neighborItem(items, a, 'next')).toBe(b)
    expect(neighborItem(items, b, 'previous')).toBe(a)
    expect(neighborItem(items, b, 'next')).toBeUndefined()
    expect(neighborItem(items, a, 'previous')).toBeUndefined()
    expect(neighborItem(items, b, 'first')).toBe(a)
    expect(neighborItem(items, a, 'last')).toBe(b)
    expect(neighborItem(items, a, 'first')).toBeUndefined()
  })

  it('moves to the item nearest in time in the next row with items', () => {
    // Row 1 has no items, so down skips it. c covers 200, the start of b.
    expect(neighborItem(items, b, 'down')).toBe(c)
    expect(neighborItem(items, a, 'down')).toBe(c)
    expect(neighborItem(items, d, 'up')).toBe(b)
    expect(neighborItem(items, a, 'up')).toBeUndefined()
  })

  it('treats a running item as open to the right', () => {
    const running = [item('open', 0, 0), item('late', 1, 900, 950), item('early', 1, 10, 20)]
    expect(neighborItem(running, running[1]!, 'up')?.target.key).toBe('open')
  })
})
