import type { DisplayDescriptor, MultiDisplaySnapshot } from '../display/types'

import { describe, expect, it } from 'vitest'

import { findDisplayForPoint, resolveDisplayPoint, toBackingPixelCoord, toDisplayLocalCoord, toGlobalCoord } from '../display/types'

function createTestSnapshot(): MultiDisplaySnapshot {
  const mainDisplay: DisplayDescriptor = {
    displayId: 1,
    isMain: true,
    isBuiltIn: true,
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    visibleBounds: { x: 0, y: 65, width: 1512, height: 884 },
    scaleFactor: 2,
    pixelWidth: 3024,
    pixelHeight: 1964,
  }

  const externalDisplay: DisplayDescriptor = {
    displayId: 3,
    isMain: false,
    isBuiltIn: false,
    bounds: { x: -222, y: -1080, width: 1920, height: 1080 },
    visibleBounds: { x: -222, y: -1080, width: 1920, height: 1080 },
    scaleFactor: 1,
    pixelWidth: 1920,
    pixelHeight: 1080,
  }

  return {
    displays: [mainDisplay, externalDisplay],
    combinedBounds: { x: -222, y: -1080, width: 1920, height: 2062 },
    capturedAt: '2025-01-01T00:00:00.000Z',
  }
}

describe('findDisplayForPoint', () => {
  it('finds the main display for a point on it', () => {
    const snapshot = createTestSnapshot()
    const display = findDisplayForPoint(snapshot, 756, 491)

    expect(display).toBeDefined()
    expect(display!.displayId).toBe(1)
    expect(display!.isMain).toBe(true)
  })

  it('finds the external display for a point on it', () => {
    const snapshot = createTestSnapshot()
    const display = findDisplayForPoint(snapshot, -100, -500)

    expect(display).toBeDefined()
    expect(display!.displayId).toBe(3)
    expect(display!.isMain).toBe(false)
  })

  it('returns undefined for a point outside all displays', () => {
    const snapshot = createTestSnapshot()
    const display = findDisplayForPoint(snapshot, 5000, 500)

    expect(display).toBeUndefined()
  })

  it('handles edge case at display boundary', () => {
    const snapshot = createTestSnapshot()
    // y=0 is the first row of the main display below the upper external display.
    const display = findDisplayForPoint(snapshot, 0, 0)

    expect(display).toBeDefined()
    expect(display!.displayId).toBe(1)
  })
})

describe('toDisplayLocalCoord', () => {
  it('converts global to local coordinates on main display', () => {
    const snapshot = createTestSnapshot()
    const local = toDisplayLocalCoord(snapshot.displays[0], 756, 491)

    expect(local.x).toBe(756)
    expect(local.y).toBe(491)
  })

  it('converts global to local coordinates on external display', () => {
    const snapshot = createTestSnapshot()
    const local = toDisplayLocalCoord(snapshot.displays[1], -100, -500)

    expect(local.x).toBe(122)
    expect(local.y).toBe(580)
  })
})

describe('toGlobalCoord', () => {
  it('converts local back to global on main display', () => {
    const snapshot = createTestSnapshot()
    const global = toGlobalCoord(snapshot.displays[0], 756, 491)

    expect(global.x).toBe(756)
    expect(global.y).toBe(491)
  })

  it('converts local back to global on external display', () => {
    const snapshot = createTestSnapshot()
    const global = toGlobalCoord(snapshot.displays[1], 122, 580)

    expect(global.x).toBe(-100)
    expect(global.y).toBe(-500)
  })

  it('is inverse of toDisplayLocalCoord', () => {
    const snapshot = createTestSnapshot()
    const display = snapshot.displays[1]
    const globalPoint = { x: 800, y: -100 }
    const local = toDisplayLocalCoord(display, globalPoint.x, globalPoint.y)
    const roundTrip = toGlobalCoord(display, local.x, local.y)

    expect(roundTrip.x).toBe(globalPoint.x)
    expect(roundTrip.y).toBe(globalPoint.y)
  })
})

describe('toBackingPixelCoord', () => {
  it('maps Retina display-local logical coordinates to backing pixels', () => {
    const snapshot = createTestSnapshot()
    const backing = toBackingPixelCoord(snapshot.displays[0], 100, 50)

    expect(backing).toEqual({ x: 200, y: 100 })
  })

  it('leaves 1x external display-local coordinates unchanged', () => {
    const snapshot = createTestSnapshot()
    const backing = toBackingPixelCoord(snapshot.displays[1], 122, 580)

    expect(backing).toEqual({ x: 122, y: 580 })
  })
})

describe('resolveDisplayPoint', () => {
  it('resolves main Retina global point without scaling the original global coordinate', () => {
    const snapshot = createTestSnapshot()
    const resolved = resolveDisplayPoint(snapshot, 100, 50)

    expect(resolved).toBeDefined()
    expect(resolved!.global).toEqual({ x: 100, y: 50 })
    expect(resolved!.local).toEqual({ x: 100, y: 50 })
    expect(resolved!.backingPixel).toEqual({ x: 200, y: 100 })
    expect(resolved!.display.displayId).toBe(1)
  })

  it('resolves negative-coordinate external display points', () => {
    const snapshot = createTestSnapshot()
    const resolved = resolveDisplayPoint(snapshot, -100, -500)

    expect(resolved).toBeDefined()
    expect(resolved!.global).toEqual({ x: -100, y: -500 })
    expect(resolved!.local).toEqual({ x: 122, y: 580 })
    expect(resolved!.backingPixel).toEqual({ x: 122, y: 580 })
    expect(resolved!.display.displayId).toBe(3)
  })
})
