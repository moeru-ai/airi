import { describe, expect, it, vi } from 'vitest'

import {
  centerWindowOnDisplay,
  computeCenteredWindowBounds,
} from './window-position'

describe('computeCenteredWindowBounds', () => {
  it('preserves the window size and centers it inside the display work area', () => {
    const result = computeCenteredWindowBounds({
      displayWorkArea: { x: 0, y: 25, width: 1440, height: 875 },
      windowBounds: { x: 1200, y: 700, width: 450, height: 600 },
    })

    expect(result).toEqual({ x: 495, y: 162, width: 450, height: 600 })
  })

  it('supports display work areas with negative origins', () => {
    const result = computeCenteredWindowBounds({
      displayWorkArea: { x: -1920, y: -1080, width: 1920, height: 1055 },
      windowBounds: { x: -2300, y: -1300, width: 500, height: 620 },
    })

    expect(result).toEqual({ x: -1210, y: -863, width: 500, height: 620 })
  })

  it('keeps oversized windows anchored inside the display work area origin', () => {
    const result = computeCenteredWindowBounds({
      displayWorkArea: { x: 120, y: 45, width: 800, height: 500 },
      windowBounds: { x: -2000, y: -900, width: 1000, height: 640 },
    })

    expect(result).toEqual({ x: 120, y: 45, width: 1000, height: 640 })
  })
})

describe('centerWindowOnDisplay', () => {
  it('sets centered bounds and shows the window', () => {
    const windowBounds = { x: 1200, y: 700, width: 450, height: 600 }
    const displayWorkArea = { x: 0, y: 25, width: 1440, height: 875 }
    const setBounds = vi.fn()
    const show = vi.fn()

    const result = centerWindowOnDisplay({
      getDisplayMatching: vi.fn(() => ({ workArea: displayWorkArea })),
      window: {
        getBounds: () => windowBounds,
        setBounds,
        show,
      },
    })

    expect(result).toEqual({ x: 495, y: 162, width: 450, height: 600 })
    expect(setBounds).toHaveBeenCalledWith({ x: 495, y: 162, width: 450, height: 600 })
    expect(show).toHaveBeenCalledTimes(1)
  })
})
