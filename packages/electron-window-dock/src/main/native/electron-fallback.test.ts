import type { Rectangle } from 'electron'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { collectElectronWindows, getWindowsAboveElectronTarget } from './electron-fallback'

interface FakeBrowserWindow {
  id: number
  getBounds: () => Rectangle
  getTitle: () => string
  isAlwaysOnTop: () => boolean
  isDestroyed: () => boolean
  isFullScreen: () => boolean
  isMinimized: () => boolean
  isVisible: () => boolean
}

const electron = vi.hoisted(() => ({
  display: { x: 0, y: 0, width: 1920, height: 1080 },
  windows: new Map<number, FakeBrowserWindow>(),
  focusedId: undefined as number | undefined,
}))

vi.mock('electron', () => ({
  app: { name: 'AIRI' },
  BrowserWindow: {
    getAllWindows: () => [...electron.windows.values()],
    getFocusedWindow: () => (electron.focusedId === undefined ? null : electron.windows.get(electron.focusedId) ?? null),
    fromId: (id: number) => electron.windows.get(id) ?? null,
  },
  screen: {
    getAllDisplays: () => [{ bounds: electron.display }],
  },
}))

/** The target window of each test. Its Electron ID is 1. */
const TARGET_BOUNDS = { x: 100, y: 100, width: 800, height: 600 }

function addWindow(id: number, options: { bounds: Rectangle, alwaysOnTop?: boolean, visible?: boolean }) {
  electron.windows.set(id, {
    id,
    getBounds: () => options.bounds,
    getTitle: () => `window ${id}`,
    isAlwaysOnTop: () => options.alwaysOnTop ?? false,
    isDestroyed: () => false,
    isFullScreen: () => false,
    isMinimized: () => false,
    isVisible: () => options.visible ?? true,
  })
}

function windowsAboveTarget() {
  return getWindowsAboveElectronTarget('electron:1', collectElectronWindows())
}

describe('getWindowsAboveElectronTarget', () => {
  beforeEach(() => {
    electron.windows.clear()
    electron.focusedId = undefined
    addWindow(1, { bounds: TARGET_BOUNDS })
  })

  // https://github.com/moeru-ai/airi/pull/979 (round 5 on macOS: Settings focused, state `not-frontmost`)
  // ROOT CAUSE:
  //
  // A focused target still counted each pinned AIRI window, for example the main stage window, as above it.
  //
  // We fixed this by returning no windows above a focused target.
  it('counts a focused target as frontmost when a pinned AIRI window overlaps it', () => {
    addWindow(2, { bounds: { x: 700, y: 500, width: 450, height: 600 }, alwaysOnTop: true })
    electron.focusedId = 1

    expect(windowsAboveTarget()).toEqual([])
  })

  it('reports one window of display size when no AIRI window has focus', () => {
    const above = windowsAboveTarget()

    expect(above).toHaveLength(1)
    expect(above[0].id).toBe('external:frontmost')
    expect(above[0].bounds).toEqual(electron.display)
  })

  it('counts a focused AIRI window only when it intersects the target', () => {
    addWindow(2, { bounds: { x: 1000, y: 100, width: 400, height: 300 } })
    electron.focusedId = 2

    expect(windowsAboveTarget()).toEqual([])

    addWindow(2, { bounds: { x: 800, y: 100, width: 400, height: 300 } })

    expect(windowsAboveTarget().map(window => window.id)).toEqual(['electron:2'])
  })

  it('counts a visible always-on-top AIRI window only when it intersects the target', () => {
    addWindow(2, { bounds: { x: 1400, y: 0, width: 300, height: 300 } })
    addWindow(3, { bounds: { x: 1000, y: 100, width: 400, height: 300 }, alwaysOnTop: true })
    addWindow(4, { bounds: { x: 800, y: 600, width: 400, height: 300 }, alwaysOnTop: true })
    addWindow(5, { bounds: { x: 200, y: 200, width: 400, height: 300 }, alwaysOnTop: true, visible: false })
    electron.focusedId = 2

    expect(windowsAboveTarget().map(window => window.id)).toEqual(['electron:4'])
  })

  it('counts only the focused window when the target is always on top', () => {
    addWindow(1, { bounds: TARGET_BOUNDS, alwaysOnTop: true })
    addWindow(2, { bounds: { x: 200, y: 200, width: 400, height: 300 } })
    addWindow(3, { bounds: { x: 300, y: 300, width: 400, height: 300 }, alwaysOnTop: true })
    electron.focusedId = 2

    expect(windowsAboveTarget().map(window => window.id)).toEqual(['electron:2'])
  })
})
