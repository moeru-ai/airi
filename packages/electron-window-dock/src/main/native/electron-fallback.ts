import type { WindowMeta } from '../window-tracker'

import process from 'node:process'

import { app, BrowserWindow } from 'electron'

import { getDisplayBounds, rectsIntersect } from '../display'
import { ELECTRON_WINDOW_ID_PREFIX, toElectronWindowId } from '../window-ids'

export function collectElectronWindows(): WindowMeta[] {
  return BrowserWindow.getAllWindows()
    .filter(window => !window.isDestroyed())
    .map(windowToMeta)
}

/**
 * Returns the windows above the target. Electron gives no z-order, so the fallback uses the focus and the
 * always-on-top state of the AIRI windows. The rules, in order:
 *
 * 1. If no AIRI window has focus, the fallback assumes that another app is active. The result is one window
 *    of display size, `external:frontmost`. This is the only signal of other apps that the fallback has.
 * 2. If the target has focus, the target is frontmost. The result is empty.
 * 3. Another AIRI window has focus. The result has each other AIRI window that intersects the target and
 *    has focus or is visible and always on top. If the target is always on top, only the focused window counts.
 *
 * In rule 3, the windows of other apps do not count, because the fallback cannot see them.
 */
export function getWindowsAboveElectronTarget(windowId: string, windows: WindowMeta[]): WindowMeta[] {
  const target = windows.find(window => window.id === windowId)
  if (!target) {
    return []
  }

  const focused = BrowserWindow.getFocusedWindow()
  if (!focused || focused.isDestroyed()) {
    return [createExternalFrontmostMeta(target)]
  }

  const focusedId = toElectronWindowId(focused.id)
  if (focusedId === windowId) {
    return []
  }

  const targetAlwaysOnTop = resolveBrowserWindow(windowId)?.isAlwaysOnTop() ?? false
  return windows.filter((meta) => {
    if (meta.id === windowId || !rectsIntersect(meta.bounds, target.bounds)) {
      return false
    }
    if (meta.id === focusedId) {
      return true
    }
    if (targetAlwaysOnTop) {
      return false
    }
    const candidate = resolveBrowserWindow(meta.id)
    return !!candidate && !candidate.isDestroyed() && candidate.isAlwaysOnTop() && candidate.isVisible()
  })
}

function windowToMeta(window: BrowserWindow): WindowMeta {
  const bounds = window.getBounds()
  return {
    id: toElectronWindowId(window.id),
    title: window.getTitle(),
    appName: app.name,
    ownerPid: process.pid,
    layer: 0,
    isOnScreen: window.isVisible(),
    isMinimized: window.isMinimized(),
    isFullscreen: window.isFullScreen(),
    bounds,
    displayBounds: getDisplayBounds(bounds),
  }
}

function createExternalFrontmostMeta(target: WindowMeta): WindowMeta {
  const bounds = target.displayBounds ?? target.bounds
  return {
    ...target,
    id: 'external:frontmost',
    title: 'Frontmost window',
    appName: 'external',
    ownerPid: undefined,
    layer: 0,
    isOnScreen: true,
    isMinimized: false,
    isFullscreen: false,
    bounds,
    displayBounds: bounds,
  }
}

function resolveBrowserWindow(metaId: string): BrowserWindow | undefined {
  const parsedId = parseElectronId(metaId)
  return typeof parsedId === 'number' ? BrowserWindow.fromId(parsedId) ?? undefined : undefined
}

function parseElectronId(windowId: string): number | undefined {
  if (!windowId.startsWith(ELECTRON_WINDOW_ID_PREFIX)) {
    return undefined
  }
  const raw = Number.parseInt(windowId.slice(ELECTRON_WINDOW_ID_PREFIX.length), 10)
  return Number.isFinite(raw) ? raw : undefined
}
