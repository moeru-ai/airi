import { describe, expect, it } from 'vitest'

import { selectRange } from './use-drag-selection'

const ids = ['a', 'b', 'c', 'd', 'e']

describe('selectRange', () => {
  it('selects the items from the anchor down to the pointer, and keeps the earlier selection', () => {
    expect([...selectRange(new Set(['e']), ids, 1, 3, true)].sort()).toEqual(['b', 'c', 'd', 'e'])
  })

  it('selects the same items when the drag goes up', () => {
    expect([...selectRange(new Set(), ids, 3, 1, true)].sort()).toEqual(['b', 'c', 'd'])
  })

  it('clears the range when the drag started on a selected item', () => {
    expect([...selectRange(new Set(['a', 'b', 'c', 'd']), ids, 1, 2, false)].sort()).toEqual(['a', 'd'])
  })

  // The gesture applies each range to the selection from before the press, so a drag that comes back undoes itself.
  it('gives the items outside the range their state from before the drag', () => {
    const base = new Set(['d'])
    expect([...selectRange(base, ids, 0, 3, true)].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect([...selectRange(base, ids, 0, 1, true)].sort()).toEqual(['a', 'b', 'd'])
    expect([...base]).toEqual(['d'])
  })

  it('keeps the range inside the list', () => {
    expect([...selectRange(new Set(), ids, 3, 9, true)].sort()).toEqual(['d', 'e'])
    expect(selectRange(new Set(), [], 0, 2, true).size).toBe(0)
  })
})
