import { describe, expect, it, vi } from 'vitest'

import { INLAY_WINDOW_HEIGHT, inlayWindowBounds } from './bounds'

// NOTICE:
// The display helpers import Electron's `screen`. Mocking 'electron' keeps Vitest from loading the Electron binary.
// The same mock is in apps/stage-tamagotchi/src/main/windows/shared/display.test.ts.
// Can be safely deleted if unit tests are executed inside an Electron-based test runner.
vi.mock('electron', () => ({ screen: {} }))

describe('inlayWindowBounds', () => {
  it('centers the inlay and keeps 10% of a laptop work area below it', () => {
    // A 1470x956 display with a 33px menu bar and a 70px Dock.
    const workArea = { x: 0, y: 33, width: 1470, height: 853 }

    const bounds = inlayWindowBounds(workArea)

    expect(bounds.width).toBe(485)
    expect(bounds.x).toBe(493)
    expect(bounds.y + bounds.height).toBe(33 + 853 - 85)
    expect(bounds.height).toBe(INLAY_WINDOW_HEIGHT)
  })

  it('places the inlay on a secondary display in that display\'s coordinates', () => {
    const workArea = { x: -2560, y: -200, width: 2560, height: 1415 }

    const bounds = inlayWindowBounds(workArea)

    expect(bounds.x).toBe(-2560 + Math.round((2560 - bounds.width) / 2))
    expect(bounds.y + bounds.height).toBe(-200 + 1415 - 142)
  })

  it('keeps at least 56px below the inlay on a short work area', () => {
    const workArea = { x: 0, y: 0, width: 1280, height: 400 }

    const bounds = inlayWindowBounds(workArea)

    expect(bounds.y + bounds.height).toBe(400 - 56)
  })
})
