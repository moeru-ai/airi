import { describe, expect, it } from 'vitest'

import { createDesktopCursorSample, resolveDesktopCapabilities } from './desktop-capabilities'

const displays = [
  { id: 1, bounds: { x: -1920, y: -240, width: 1920, height: 1080 }, workArea: { x: -1920, y: -240, width: 1920, height: 1040 }, scaleFactor: 1 },
  { id: 2, bounds: { x: 0, y: 0, width: 1440, height: 2560 }, workArea: { x: 0, y: 0, width: 1440, height: 2520 }, scaleFactor: 2 },
]

function capabilities(overrides: Partial<Parameters<typeof resolveDesktopCapabilities>[0]> = {}) {
  return resolveDesktopCapabilities({ platform: 'linux', ozonePlatform: 'x11', nativeNotifications: true, displays, layoutRevision: 0, ...overrides })
}

describe('desktop capability diagnostics', () => {
  it('reports native Wayland restrictions and local-only pointer source', () => {
    const result = capabilities({ ozonePlatform: 'wayland', sessionType: 'wayland' })
    expect(result.backend).toBe('wayland')
    expect(result.globalCursor).toBe('unsupported')
    expect(result.windowPositioning).toBe('unsupported')
    expect(result.cursorSource).toBe('window-local')
    expect(result.detection).toBe('explicit')
  })

  it('honors the explicit XWayland fallback inside a Wayland session', () => {
    const result = capabilities({ ozonePlatform: 'x11', waylandDisplay: 'wayland-0' })
    expect(result.backend).toBe('xwayland')
    expect(result.globalCursor).toBe('available')
    expect(result.cursorSource).toBe('electron-screen')
  })

  it('labels session-based inference and unknown backends without claiming global support', () => {
    expect(capabilities({ ozonePlatform: 'auto', sessionType: 'wayland' }).detection).toBe('session')
    expect(capabilities({ ozonePlatform: undefined, waylandDisplay: 'wayland-0' }).globalCursor).toBe('unsupported')
    expect(capabilities({ ozonePlatform: undefined }).globalCursor).toBe('unknown')
    expect(capabilities({ ozonePlatform: undefined, xDisplay: ':0' }).globalCursor).toBe('available')
    expect(capabilities({ platform: 'other' }).cursorSource).toBe('window-local')
  })

  it('does not apply a stale Wayland environment to other operating systems', () => {
    expect(capabilities({ platform: 'darwin', waylandDisplay: 'wayland-0' }).backend).toBe('macos')
    expect(capabilities({ platform: 'win32', waylandDisplay: 'wayland-0' }).globalCursor).toBe('available')
  })

  it('returns fresh, detached topology after hotplug without primary-display assumptions', () => {
    const initial = capabilities()
    const removed = capabilities({ displays: displays.slice(1), layoutRevision: 1 })
    expect(initial.displays).toHaveLength(2)
    expect(removed.displays).toHaveLength(1)
    expect(removed.layoutRevision).toBe(1)
    expect(removed.displays[0].bounds.height).toBe(2560)
    removed.displays[0].bounds.x = 123
    expect(displays[1].bounds.x).toBe(0)
  })
})

describe('desktop cursor coordinates', () => {
  it('subtracts negative content origins in DIP and applies page zoom once', () => {
    const point = createDesktopCursorSample({ point: { x: -1700, y: -100 }, contentBounds: { x: -1800, y: -200 }, zoomFactor: 1.25, displayId: 1, sampledAt: 1, layoutRevision: 2 })
    expect(point?.screenDip).toEqual({ x: -1700, y: -100 })
    expect(point?.localCss).toEqual({ x: 80, y: 80 })
    expect(point?.layoutRevision).toBe(2)
  })

  it('preserves cross-display distances without mixing physical pixels and DIP', () => {
    const point = createDesktopCursorSample({ point: { x: 400, y: 500 }, contentBounds: { x: -1800, y: -200 }, zoomFactor: 1, displayId: 2, sampledAt: 1, layoutRevision: 0 })
    expect(point?.localCss).toEqual({ x: 2200, y: 700 })
    expect(point?.displayId).toBe(2)
  })

  it('rejects malformed samples instead of moving the gaze to a false origin', () => {
    const input = { point: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0 }, zoomFactor: 1, displayId: 1, sampledAt: 1, layoutRevision: 0 }
    expect(createDesktopCursorSample({ ...input, zoomFactor: 0 })).toBeNull()
    expect(createDesktopCursorSample({ ...input, point: { x: Number.NaN, y: 0 } })).toBeNull()
  })
})
