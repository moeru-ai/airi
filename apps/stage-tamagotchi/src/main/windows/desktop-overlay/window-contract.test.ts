import { describe, expect, it, vi } from 'vitest'

import {
  applyDesktopOverlayInputIsolation,
  createDesktopOverlayWindowOptions,
  showDesktopOverlayWithoutFocus,
} from './window-contract'

describe('createDesktopOverlayWindowOptions', () => {
  it('creates non-focusable transparent overlay window options for display bounds', () => {
    const options = createDesktopOverlayWindowOptions({
      bounds: { x: -222, y: -1080, width: 1920, height: 1080 },
      preloadPath: '/tmp/airi-overlay-preload.js',
    })

    expect(options.title).toBe('AIRI Desktop Overlay')
    expect(options.x).toBe(-222)
    expect(options.y).toBe(-1080)
    expect(options.width).toBe(1920)
    expect(options.height).toBe(1080)
    expect(options.show).toBe(false)
    expect(options.frame).toBe(false)
    expect(options.transparent).toBe(true)
    expect(options.alwaysOnTop).toBe(true)
    expect(options.skipTaskbar).toBe(true)
    expect(options.hasShadow).toBe(false)
    expect(options.roundedCorners).toBe(false)
    expect(options.focusable).toBe(false)
    expect(options.webPreferences?.preload).toBe('/tmp/airi-overlay-preload.js')
    expect(options.webPreferences?.sandbox).toBe(false)
    expect(options.webPreferences?.backgroundThrottling).toBe(false)
  })
})

describe('applyDesktopOverlayInputIsolation', () => {
  it('applies click-through and non-interactive overlay window flags', () => {
    const window = {
      setAlwaysOnTop: vi.fn(),
      setContentProtection: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
    }

    applyDesktopOverlayInputIsolation(window)

    expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(window.setContentProtection).toHaveBeenCalledWith(true)
    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
  })
})

describe('showDesktopOverlayWithoutFocus', () => {
  it('uses showInactive and never calls active show or focus paths', () => {
    const window = {
      focus: vi.fn(),
      show: vi.fn(),
      showInactive: vi.fn(),
    }

    showDesktopOverlayWithoutFocus(window)

    expect(window.showInactive).toHaveBeenCalledTimes(1)
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })
})
