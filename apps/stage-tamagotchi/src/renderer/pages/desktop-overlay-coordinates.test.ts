import { describe, expect, it } from 'vitest'

import {
  pointInOverlay,
  rectIntersectsOverlay,
  screenRectToLocal,
  screenToLocal,
} from './desktop-overlay-coordinates'

// ---------------------------------------------------------------------------
// screenToLocal
// ---------------------------------------------------------------------------

describe('screenToLocal', () => {
  it('subtracts overlay origin from screen point', () => {
    const result = screenToLocal({ x: 500, y: -800 }, { x: 0, y: -1080 })
    expect(result).toEqual({ x: 500, y: 280 })
  })

  it('is identity when overlay origin is (0,0)', () => {
    const result = screenToLocal({ x: 100, y: 200 }, { x: 0, y: 0 })
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('handles negative overlay origin', () => {
    const result = screenToLocal({ x: 441, y: -1037 }, { x: 0, y: -1080 })
    expect(result).toEqual({ x: 441, y: 43 })
  })
})

// ---------------------------------------------------------------------------
// screenRectToLocal
// ---------------------------------------------------------------------------

describe('screenRectToLocal', () => {
  it('shifts rect origin, preserves size', () => {
    const result = screenRectToLocal(
      { height: 30, width: 80, x: 100, y: -1000 },
      { x: 0, y: -1080 },
    )
    expect(result).toEqual({ height: 30, width: 80, x: 100, y: 80 })
  })

  it('is identity when overlay origin is (0,0)', () => {
    const rect = { height: 150, width: 200, x: 50, y: 100 }
    const result = screenRectToLocal(rect, { x: 0, y: 0 })
    expect(result).toEqual(rect)
  })
})

// ---------------------------------------------------------------------------
// rectIntersectsOverlay
// ---------------------------------------------------------------------------

describe('rectIntersectsOverlay', () => {
  const overlay = { height: 900, width: 1440, x: 0, y: -1080 }

  it('returns true for rect fully inside overlay', () => {
    expect(rectIntersectsOverlay(
      { height: 30, width: 80, x: 100, y: -1000 },
      overlay,
    )).toBe(true)
  })

  it('returns true for rect partially overlapping', () => {
    expect(rectIntersectsOverlay(
      { height: 50, width: 100, x: 1400, y: -1080 },
      overlay,
    )).toBe(true)
  })

  it('returns false for rect entirely above overlay', () => {
    expect(rectIntersectsOverlay(
      { height: 30, width: 80, x: 100, y: -2000 },
      overlay,
    )).toBe(false)
  })

  it('returns false for rect entirely below overlay', () => {
    expect(rectIntersectsOverlay(
      { height: 30, width: 80, x: 100, y: 0 },
      overlay,
    )).toBe(false)
  })

  it('returns false for rect entirely to the right', () => {
    expect(rectIntersectsOverlay(
      { height: 30, width: 80, x: 1500, y: -500 },
      overlay,
    )).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// pointInOverlay
// ---------------------------------------------------------------------------

describe('pointInOverlay', () => {
  const overlay = { height: 900, width: 1440, x: 0, y: -1080 }

  it('returns true for point inside', () => {
    expect(pointInOverlay({ x: 720, y: -540 }, overlay)).toBe(true)
  })

  it('returns true for point at top-left corner', () => {
    expect(pointInOverlay({ x: 0, y: -1080 }, overlay)).toBe(true)
  })

  it('returns false for point outside (below)', () => {
    expect(pointInOverlay({ x: 720, y: 0 }, overlay)).toBe(false)
  })

  it('returns false for point outside (above)', () => {
    expect(pointInOverlay({ x: 720, y: -1200 }, overlay)).toBe(false)
  })

  it('returns false for point outside (right)', () => {
    expect(pointInOverlay({ x: 1500, y: -540 }, overlay)).toBe(false)
  })
})
