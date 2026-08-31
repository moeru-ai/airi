import { describe, expect, it } from 'vitest'

import { sanitizePersistedWindowBounds } from './window-bounds'

const primary = { x: 0, y: 0, width: 1920, height: 1040 }

describe('sanitizePersistedWindowBounds (#2181)', () => {
  it('leaves fully on-screen bounds unchanged', () => {
    const bounds = { x: 200, y: 150, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [primary], primary)).toEqual(bounds)
  })

  it('clamps a window dragged partly past the right/bottom edge back into view', () => {
    const bounds = { x: 1800, y: 900, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [primary], primary)).toEqual({
      x: 1920 - 450, // 1470
      y: 1040 - 600, // 440
      width: 450,
      height: 600,
    })
  })

  it('clamps a window with a negative (top-left) position back into view', () => {
    const bounds = { x: -300, y: -200, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [primary], primary)).toEqual({
      x: 0,
      y: 0,
      width: 450,
      height: 600,
    })
  })

  it('centers on the primary display when bounds are fully off every screen', () => {
    // Saved far off-screen (e.g. on a monitor that is no longer connected).
    const bounds = { x: 5000, y: 5000, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [primary], primary)).toEqual({
      x: Math.round((1920 - 450) / 2), // 735
      y: Math.round((1040 - 600) / 2), // 220
      width: 450,
      height: 600,
    })
  })

  it('keeps a window on the secondary display it still overlaps', () => {
    const secondary = { x: 1920, y: 0, width: 1920, height: 1040 }
    const bounds = { x: 2200, y: 300, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [primary, secondary], primary)).toEqual(bounds)
  })

  it('falls back to centering when no work areas are available', () => {
    const bounds = { x: 100, y: 100, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [], primary)).toEqual({
      x: Math.round((1920 - 450) / 2),
      y: Math.round((1040 - 600) / 2),
      width: 450,
      height: 600,
    })
  })
})
