import { describe, expect, it } from 'vitest'

import { hasMouseMovedSinceExpand, shouldCollapseControlsIsland } from './auto-collapse'

describe('controls island auto collapse helpers', () => {
  it('does not arm auto collapse until the pointer actually moves', () => {
    expect(hasMouseMovedSinceExpand({ currentX: 100, currentY: 200, initialX: 100, initialY: 200 })).toBe(false)
    expect(hasMouseMovedSinceExpand({ currentX: 101, currentY: 200, initialX: 100, initialY: 200 })).toBe(true)
    expect(hasMouseMovedSinceExpand({ currentX: 100, currentY: 201, initialX: 100, initialY: 200 })).toBe(true)
  })

  it('only collapses when expanded, armed, outside, and not blocked', () => {
    expect(shouldCollapseControlsIsland({ expanded: true, autoCollapseArmed: true, isOutside: true, isBlocked: false })).toBe(true)
    expect(shouldCollapseControlsIsland({ expanded: true, autoCollapseArmed: false, isOutside: true, isBlocked: false })).toBe(false)
    expect(shouldCollapseControlsIsland({ expanded: true, autoCollapseArmed: true, isOutside: false, isBlocked: false })).toBe(false)
    expect(shouldCollapseControlsIsland({ expanded: true, autoCollapseArmed: true, isOutside: true, isBlocked: true })).toBe(false)
  })
})
