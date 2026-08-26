import type { Rectangle } from 'electron'

import { screen } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import {
  centerWindowOnDisplay,
  computeCenteredWindowBounds,
  computeResizedBoundsAnchoredToDominantDisplay,
  heightFrom,
  mapForBreakpoints,
  widthFrom,
} from './display'

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

/**
 * @example
 * computeCenteredWindowBounds({ displayWorkArea, windowBounds })
 */
describe('computeCenteredWindowBounds', () => {
  /**
   * @example
   * A 450x600 window is centered without changing its size.
   */
  it('preserves the window size and centers it inside the display work area', () => {
    const result = computeCenteredWindowBounds({
      displayWorkArea: { x: 0, y: 25, width: 1440, height: 875 },
      windowBounds: { x: 1200, y: 700, width: 450, height: 600 },
    })

    expect(result).toEqual({ x: 495, y: 162, width: 450, height: 600 })
  })

  /**
   * @example
   * A display above and left of the primary screen keeps negative coordinates.
   */
  it('supports display work areas with negative origins', () => {
    const result = computeCenteredWindowBounds({
      displayWorkArea: { x: -1920, y: -1080, width: 1920, height: 1055 },
      windowBounds: { x: -2300, y: -1300, width: 500, height: 620 },
    })

    expect(result).toEqual({ x: -1210, y: -863, width: 500, height: 620 })
  })

  /**
   * @example
   * An oversized window starts at the work-area origin instead of moving farther off-screen.
   */
  it('keeps oversized windows anchored inside the display work area origin', () => {
    const result = computeCenteredWindowBounds({
      displayWorkArea: { x: 120, y: 45, width: 800, height: 500 },
      windowBounds: { x: -2000, y: -900, width: 1000, height: 640 },
    })

    expect(result).toEqual({ x: 120, y: 45, width: 1000, height: 640 })
  })
})

/**
 * @example
 * centerWindowOnDisplay(window)
 */
describe('centerWindowOnDisplay', () => {
  /**
   * @example
   * The recovered window receives centered bounds and becomes visible.
   */
  it('sets centered bounds and shows the window', () => {
    const windowBounds = { x: 1200, y: 700, width: 450, height: 600 }
    const displayWorkArea = { x: 0, y: 25, width: 1440, height: 875 }
    const setBounds = vi.fn()
    const show = vi.fn()
    vi.mocked(screen.getDisplayMatching).mockReturnValue({ workArea: displayWorkArea } as Electron.Display)

    const result = centerWindowOnDisplay({
      getBounds: () => windowBounds,
      isDestroyed: () => false,
      setBounds,
      show,
    })

    expect(result).toEqual({ x: 495, y: 162, width: 450, height: 600 })
    expect(screen.getDisplayMatching).toHaveBeenCalledWith(windowBounds)
    expect(setBounds).toHaveBeenCalledWith({ x: 495, y: 162, width: 450, height: 600 })
    expect(show).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * A missing main window reports a stable domain error to the renderer.
   */
  it('rejects recovery when the target window is unavailable', () => {
    expect(() => centerWindowOnDisplay(undefined)).toThrowError('Main AIRI window is not available.')
  })

  /**
   * @example
   * A destroyed window is rejected before Electron bounds methods are called.
   */
  it('rejects recovery when the target window was destroyed', () => {
    const getBounds = vi.fn()

    expect(() => centerWindowOnDisplay({
      getBounds,
      isDestroyed: () => true,
      setBounds: vi.fn(),
      show: vi.fn(),
    })).toThrowError('Main AIRI window is not available.')
    expect(getBounds).not.toHaveBeenCalled()
  })
})
