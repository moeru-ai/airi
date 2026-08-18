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
      { x: 100, y: -1000, width: 80, height: 30 },
      { x: 0, y: -1080 },
    )
    expect(result).toEqual({ x: 100, y: 80, width: 80, height: 30 })
  })

  it('is identity when overlay origin is (0,0)', () => {
    const rect = { x: 50, y: 100, width: 200, height: 150 }
    const result = screenRectToLocal(rect, { x: 0, y: 0 })
    expect(result).toEqual(rect)
  })
})

// ---------------------------------------------------------------------------
// rectIntersectsOverlay
// ---------------------------------------------------------------------------

describe('rectIntersectsOverlay', () => {
  const overlay = { x: 0, y: -1080, width: 1440, height: 900 }

  it('returns true for rect fully inside overlay', () => {
    expect(rectIntersectsOverlay(
      { x: 100, y: -1000, width: 80, height: 30 },
      overlay,
    )).toBe(true)
  })

  it('returns true for rect partially overlapping', () => {
    expect(rectIntersectsOverlay(
      { x: 1400, y: -1080, width: 100, height: 50 },
      overlay,
    )).toBe(true)
  })

  it('returns false for rect entirely above overlay', () => {
    expect(rectIntersectsOverlay(
      { x: 100, y: -2000, width: 80, height: 30 },
      overlay,
    )).toBe(false)
  })

  it('returns false for rect entirely below overlay', () => {
    expect(rectIntersectsOverlay(
      { x: 100, y: 0, width: 80, height: 30 },
      overlay,
    )).toBe(false)
  })

  it('returns false for rect entirely to the right', () => {
    expect(rectIntersectsOverlay(
      { x: 1500, y: -500, width: 80, height: 30 },
      overlay,
    )).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// pointInOverlay
// ---------------------------------------------------------------------------

describe('pointInOverlay', () => {
  const overlay = { x: 0, y: -1080, width: 1440, height: 900 }

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
