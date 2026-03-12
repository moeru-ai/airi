import type { DisplayDescriptor, MultiDisplaySnapshot } from '../display/types'

import { describe, expect, it } from 'vitest'

import { findDisplayForPoint, toDisplayLocalCoord, toGlobalCoord } from '../display/types'

function createTestSnapshot(): MultiDisplaySnapshot {
  const mainDisplay: DisplayDescriptor = {
    displayId: 1,
    isMain: true,
    isBuiltIn: true,
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    visibleBounds: { x: 0, y: 25, width: 1440, height: 875 },
    scaleFactor: 2,
    pixelWidth: 2880,
    pixelHeight: 1800,
  }

  const externalDisplay: DisplayDescriptor = {
    displayId: 2,
    isMain: false,
    isBuiltIn: false,
    bounds: { x: 1440, y: 0, width: 2560, height: 1440 },
    visibleBounds: { x: 1440, y: 25, width: 2560, height: 1415 },
    scaleFactor: 1,
    pixelWidth: 2560,
    pixelHeight: 1440,
  }

  return {
    displays: [mainDisplay, externalDisplay],
    combinedBounds: { x: 0, y: 0, width: 4000, height: 1440 },
    capturedAt: '2025-01-01T00:00:00.000Z',
  }
}

describe('findDisplayForPoint', () => {
  it('finds the main display for a point on it', () => {
    const snapshot = createTestSnapshot()
    const display = findDisplayForPoint(snapshot, 720, 450)

    expect(display).toBeDefined()
    expect(display!.displayId).toBe(1)
    expect(display!.isMain).toBe(true)
  })

  it('finds the external display for a point on it', () => {
    const snapshot = createTestSnapshot()
    const display = findDisplayForPoint(snapshot, 2000, 500)

    expect(display).toBeDefined()
    expect(display!.displayId).toBe(2)
    expect(display!.isMain).toBe(false)
  })

  it('returns undefined for a point outside all displays', () => {
    const snapshot = createTestSnapshot()
    const display = findDisplayForPoint(snapshot, 5000, 500)

    expect(display).toBeUndefined()
  })

  it('handles edge case at display boundary', () => {
    const snapshot = createTestSnapshot()
    // x=1440 is the first pixel of the external display
    const display = findDisplayForPoint(snapshot, 1440, 0)

    expect(display).toBeDefined()
    expect(display!.displayId).toBe(2)
  })
})

describe('toDisplayLocalCoord', () => {
  it('converts global to local coordinates on main display', () => {
    const snapshot = createTestSnapshot()
    const local = toDisplayLocalCoord(snapshot.displays[0], 720, 450)

    expect(local.x).toBe(720)
    expect(local.y).toBe(450)
  })

  it('converts global to local coordinates on external display', () => {
    const snapshot = createTestSnapshot()
    const local = toDisplayLocalCoord(snapshot.displays[1], 2000, 500)

    expect(local.x).toBe(560) // 2000 - 1440
    expect(local.y).toBe(500)
  })
})

describe('toGlobalCoord', () => {
  it('converts local back to global on main display', () => {
    const snapshot = createTestSnapshot()
    const global = toGlobalCoord(snapshot.displays[0], 720, 450)

    expect(global.x).toBe(720)
    expect(global.y).toBe(450)
  })

  it('converts local back to global on external display', () => {
    const snapshot = createTestSnapshot()
    const global = toGlobalCoord(snapshot.displays[1], 560, 500)

    expect(global.x).toBe(2000)
    expect(global.y).toBe(500)
  })

  it('is inverse of toDisplayLocalCoord', () => {
    const snapshot = createTestSnapshot()
    const display = snapshot.displays[1]
    const globalPoint = { x: 2500, y: 800 }
    const local = toDisplayLocalCoord(display, globalPoint.x, globalPoint.y)
    const roundTrip = toGlobalCoord(display, local.x, local.y)

    expect(roundTrip.x).toBe(globalPoint.x)
    expect(roundTrip.y).toBe(globalPoint.y)
  })
})
