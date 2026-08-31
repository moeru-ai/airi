import { describe, expect, it } from 'vitest'

import { sanitizePersistedWindowBounds } from './window-bounds'

// A primary display with a 40px taskbar at the bottom (workArea shorter than bounds).
const primary = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
}

describe('sanitizePersistedWindowBounds (#2181)', () => {
  it('leaves fully on-screen bounds unchanged', () => {
    const bounds = { x: 200, y: 150, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [primary], primary)).toEqual(bounds)
  })

  it('clamps a window dragged partly past the right/bottom edge into the work area', () => {
    const bounds = { x: 1800, y: 900, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [primary], primary)).toEqual({
      x: 1920 - 450, // 1470
      y: 1040 - 600, // 440 (work area bottom, above the taskbar)
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

  it('centers on the primary work area when bounds are fully off every screen', () => {
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
    const secondary = {
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
    }
    const bounds = { x: 2200, y: 300, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [primary, secondary], primary)).toEqual(bounds)
  })

  it('resolves display ownership by full bounds, not work area', () => {
    // `top` has a large dock: its workArea (height 600) is much shorter than its
    // bounds (height 1000). A window sitting mostly on `top`'s dock strip overlaps
    // `bottom`'s workArea more than `top`'s workArea, yet it is physically on
    // `top`. Ownership must resolve to `top` (by bounds) and clamp above its dock,
    // instead of jumping the window entirely onto `bottom`.
    const top = {
      bounds: { x: 0, y: 0, width: 1000, height: 1000 },
      workArea: { x: 0, y: 0, width: 1000, height: 600 },
    }
    const bottom = {
      bounds: { x: 0, y: 1000, width: 1000, height: 1000 },
      workArea: { x: 0, y: 1000, width: 1000, height: 1000 },
    }
    const bounds = { x: 0, y: 550, width: 400, height: 550 }
    expect(sanitizePersistedWindowBounds(bounds, [top, bottom], top)).toEqual({
      x: 0,
      y: 50, // top.workArea bottom (600) - height (550)
      width: 400,
      height: 550,
    })
  })

  it('falls back to centering when no displays are available', () => {
    const bounds = { x: 100, y: 100, width: 450, height: 600 }
    expect(sanitizePersistedWindowBounds(bounds, [], primary)).toEqual({
      x: Math.round((1920 - 450) / 2),
      y: Math.round((1040 - 600) / 2),
      width: 450,
      height: 600,
    })
  })
})
