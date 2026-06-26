import type { Rectangle } from 'electron'

import { describe, expect, it, vi } from 'vitest'

import { computeResizedBoundsAnchoredToDominantDisplay, heightFrom, mapForBreakpoints, widthFrom } from './display'

// NOTICE:
// Mocking 'electron' is needed to prevent Vitest from attempting to resolve/load the real Electron binary during tests.
// The real 'electron' module depends on local binary installations which fail in headless CI environments.
// apps/stage-tamagotchi/src/main/windows/shared/display.test.ts
// Can be safely deleted if unit tests are executed inside an Electron-based test runner.
vi.mock('electron', () => ({
  screen: {
    getDisplayMatching: vi.fn(),
  },
}))

describe('mapForBreakpoints', () => {
  it('should return the correct size based on breakpoints', () => {
    const val = mapForBreakpoints(800, { sm: 100, md: 200, lg: 300 })
    expect(val).toBe(200)
  })

  it('it should fallback to nearest smaller breakpoint', () => {
    const val = mapForBreakpoints(1024, { sm: 100, md: 200 }) // expected to be lg
    expect(val).toBe(200)
  })

  it('it should return the largest supplied size if bounds exceed all breakpoints', () => {
    const val1 = mapForBreakpoints(2000, { sm: 100, md: 200 }) // expected to be lg
    expect(val1).toBe(200)

    const val2 = mapForBreakpoints(2000, { 'sm': 100, 'md': 200, '2xl': 500 }) // expected to be lg
    expect(val2).toBe(500)
  })
})

describe('widthFrom', () => {
  it('should return width based on percentage', () => {
    expect(widthFrom({ width: 1000 } as Rectangle, { percentage: 0.5 })).toBe(500)
  })

  it('should return width based on fixed value', () => {
    expect(widthFrom({ width: 1000 } as Rectangle, 300)).toBe(300)
  })

  it('should respect min constraint', () => {
    expect(widthFrom({ width: 1000 } as Rectangle, { percentage: 0.1, min: 200 })).toBe(200)
    expect(widthFrom({ width: 1000 } as Rectangle, { actual: 150, min: 200 })).toBe(200)
    expect(widthFrom({ width: 1000 } as Rectangle, { actual: 250, min: 200 })).toBe(250)
  })

  it('should respect max constraint', () => {
    expect(widthFrom({ width: 1000 } as Rectangle, { percentage: 0.5, max: 400 })).toBe(400)
    expect(widthFrom({ width: 1000 } as Rectangle, { actual: 450, max: 400 })).toBe(400)
    expect(widthFrom({ width: 1000 } as Rectangle, { actual: 350, max: 400 })).toBe(350)
  })
})

describe('heightFrom', () => {
  it('should return height based on percentage', () => {
    expect(heightFrom({ height: 1000 } as Rectangle, { percentage: 0.5 })).toBe(500)
  })

  it('should return height based on fixed value', () => {
    expect(heightFrom({ height: 1000 } as Rectangle, 300)).toBe(300)
  })

  it('should respect min constraint', () => {
    expect(heightFrom({ height: 1000 } as Rectangle, { percentage: 0.1, min: 200 })).toBe(200)
    expect(heightFrom({ height: 1000 } as Rectangle, { actual: 150, min: 200 })).toBe(200)
    expect(heightFrom({ height: 1000 } as Rectangle, { actual: 250, min: 200 })).toBe(250)
  })

  it('should respect max constraint', () => {
    expect(heightFrom({ height: 1000 } as Rectangle, { percentage: 0.5, max: 400 })).toBe(400)
    expect(heightFrom({ height: 1000 } as Rectangle, { actual: 450, max: 400 })).toBe(400)
    expect(heightFrom({ height: 1000 } as Rectangle, { actual: 350, max: 400 })).toBe(350)
  })
})

describe('computeResizedBoundsAnchoredToDominantDisplay', () => {
  const primaryDisplay = {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 25, width: 1920, height: 1055 },
  }
  const secondaryDisplay = {
    bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
  }
  const topDisplay = {
    bounds: { x: 0, y: -900, width: 1600, height: 900 },
    workArea: { x: 0, y: -900, width: 1600, height: 860 },
  }

  it('uses the display with the largest overlap when resizing a window across two displays', () => {
    const bounds = computeResizedBoundsAnchoredToDominantDisplay({
      currentBounds: { x: 1700, y: 220, width: 500, height: 600 },
      targetSize: { width: 450, height: 600 },
      displays: [primaryDisplay, secondaryDisplay],
    })

    expect(bounds.x).toBe(1920)
    expect(bounds.y).toBe(220)
    expect(bounds.width).toBe(450)
    expect(bounds.height).toBe(600)
  })

  it('uses the display with the largest overlap across three displays', () => {
    const bounds = computeResizedBoundsAnchoredToDominantDisplay({
      currentBounds: { x: 1100, y: -700, width: 380, height: 620 },
      targetSize: { width: 450, height: 600 },
      displays: [primaryDisplay, secondaryDisplay, topDisplay],
    })

    expect(bounds.x).toBe(1030)
    expect(bounds.y).toBe(-680)
    expect(bounds.width).toBe(450)
    expect(bounds.height).toBe(600)
  })

  it('keeps the matching display bottom-right corner anchored when resizing in the bottom-right quadrant', () => {
    const bounds = computeResizedBoundsAnchoredToDominantDisplay({
      currentBounds: { x: 3420, y: 740, width: 300, height: 250 },
      targetSize: { width: 450, height: 600 },
      displays: [primaryDisplay, secondaryDisplay],
    })

    expect(bounds.x).toBe(3270)
    expect(bounds.y).toBe(390)
    expect(bounds.width).toBe(450)
    expect(bounds.height).toBe(600)
  })
})
