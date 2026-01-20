import type { QueryOptions as BindingQueryOptions, WindowInfo as BindingWindowInfo } from '@proj-airi/win32-window-bindings'
import type { Rectangle } from 'electron'

import type { WindowMeta, WindowTracker } from '../window-tracker'

import process from 'node:process'

import { createRequire } from 'node:module'

import { useLogg } from '@guiiai/logg'
import { screen } from 'electron'

import { collectElectronWindows, getFrontmostElectronWindow, getWindowsAboveElectronTarget } from './electron-fallback'

const log = useLogg('window-dock:win32').useGlobalConfig()

const require = createRequire(import.meta.url)

function rectToBounds(rect: { left: number, top: number, right: number, bottom: number }): Rectangle | undefined {
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  if (width <= 0 || height <= 0)
    return undefined

  return { x: rect.left, y: rect.top, width, height }
}

function intersectsDisplay(bounds: Rectangle): boolean {
  const display = screen.getDisplayMatching(bounds)
  if (!display)
    return false

  const { x, y, width, height } = bounds
  const dx = Math.max(0, Math.min(x + width, display.bounds.x + display.bounds.width) - Math.max(x, display.bounds.x))
  const dy = Math.max(0, Math.min(y + height, display.bounds.y + display.bounds.height) - Math.max(y, display.bounds.y))
  return dx > 0 && dy > 0
}

type Win32Bindings = typeof import('@proj-airi/win32-window-bindings')

const LIST_OPTS: BindingQueryOptions = { includeOwnerPid: true, includeTitle: true }
const LIGHT_OPTS: BindingQueryOptions = { includeOwnerPid: false, includeTitle: false }

function loadNativeBindings(): Win32Bindings | undefined {
  if (process.platform !== 'win32')
    return undefined

  try {
    return require('@proj-airi/win32-window-bindings') as Win32Bindings
  }
  catch (err) {
    log.withError(err as Error).warn('Win32 bindings unavailable; falling back to Electron-only tracker')
    return undefined
  }
}

function toWindowMeta(window?: BindingWindowInfo | null): WindowMeta | undefined {
  if (!window)
    return undefined

  const bounds = rectToBounds(window.rect)
  if (!bounds)
    return undefined

  const display = screen.getDisplayMatching(bounds)
  const displayBounds = display?.bounds
  const isOnScreen = window.isVisible && !window.isMinimized && !window.isCloaked && intersectsDisplay(bounds)

  return {
    id: window.id,
    title: window.title,
    appName: undefined,
    ownerPid: window.ownerPid,
    layer: 0,
    isOnScreen,
    isMinimized: window.isMinimized,
    bounds,
    displayBounds,
  }
}

function toWindowMetas(windows: BindingWindowInfo[]): WindowMeta[] {
  const results: WindowMeta[] = []
  const seen = new Set<string>()

  for (const window of windows) {
    const meta = toWindowMeta(window)
    if (meta && !seen.has(meta.id)) {
      seen.add(meta.id)
      results.push(meta)
    }
  }

  return results
}

class Win32WindowTracker implements WindowTracker {
  private readonly bindings = loadNativeBindings()

  async listWindows(): Promise<WindowMeta[]> {
    if (!this.bindings)
      return collectElectronWindows()

    try {
      return toWindowMetas(this.bindings.listWindows(LIST_OPTS) ?? [])
    }
    catch (err) {
      log.withError(err as Error).warn('Native window enumeration failed; falling back to Electron-only tracker')
      return collectElectronWindows()
    }
  }

  async getWindowMeta(windowId: string): Promise<WindowMeta | undefined> {
    if (!this.bindings)
      return (await this.listWindows()).find(window => window.id === windowId)

    try {
      return toWindowMeta(this.bindings.getWindow(windowId, LIGHT_OPTS))
    }
    catch (err) {
      log.withError(err as Error).warn('Native window lookup failed; falling back to Electron-only tracker')
      const windows = await this.listWindows()
      return windows.find(window => window.id === windowId)
    }
  }

  async getWindowsAbove(windowId: string): Promise<WindowMeta[]> {
    if (!this.bindings)
      return getWindowsAboveElectronTarget(windowId, await this.listWindows())

    try {
      return toWindowMetas(this.bindings.getWindowsAbove(windowId, LIGHT_OPTS) ?? [])
    }
    catch (err) {
      log.withError(err as Error).warn('Native z-order probe failed; falling back to Electron-only tracker')
      return getWindowsAboveElectronTarget(windowId, await this.listWindows())
    }
  }

  async getFrontmostWindow(): Promise<WindowMeta | undefined> {
    if (!this.bindings)
      return getFrontmostElectronWindow(await this.listWindows())

    try {
      return toWindowMeta(this.bindings.getForegroundWindow(LIGHT_OPTS))
    }
    catch (err) {
      log.withError(err as Error).warn('Native frontmost lookup failed; falling back to Electron-only tracker')
      return getFrontmostElectronWindow(await this.listWindows())
    }
  }
}

export class WindowsWindowTracker implements WindowTracker {
  private readonly win32Tracker = process.platform === 'win32' ? new Win32WindowTracker() : undefined

  async listWindows(): Promise<WindowMeta[]> {
    if (this.win32Tracker)
      return this.win32Tracker.listWindows()

    return collectElectronWindows()
  }

  async getWindowMeta(windowId: string): Promise<WindowMeta | undefined> {
    if (this.win32Tracker)
      return this.win32Tracker.getWindowMeta(windowId)

    const windows = await this.listWindows()
    return windows.find(window => window.id === windowId)
  }

  async getWindowsAbove(windowId: string): Promise<WindowMeta[]> {
    if (this.win32Tracker)
      return this.win32Tracker.getWindowsAbove(windowId)

    const windows = await this.listWindows()
    return getWindowsAboveElectronTarget(windowId, windows)
  }

  async getFrontmostWindow(): Promise<WindowMeta | undefined> {
    if (this.win32Tracker)
      return this.win32Tracker.getFrontmostWindow()

    const windows = await this.listWindows()
    return getFrontmostElectronWindow(windows)
  }
}
