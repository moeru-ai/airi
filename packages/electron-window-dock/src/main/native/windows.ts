import type { QueryOptions as BindingQueryOptions, WindowInfo as BindingWindowInfo, WindowRect as BindingWindowRect } from '@proj-airi/native-window-win32'
import type { Rectangle } from 'electron'

import type { WindowMeta, WindowTracker } from '../window-tracker'

import process from 'node:process'

import { createRequire } from 'node:module'

import { useLogg } from '@guiiai/logg'
import { screen } from 'electron'

import { rectsIntersect } from '../display'
import { collectElectronWindows, getWindowsAboveElectronTarget } from './electron-fallback'

const log = useLogg('window-dock:win32').useGlobalConfig()

const require = createRequire(import.meta.url)

type Win32Bindings = typeof import('@proj-airi/native-window-win32')

const LIST_OPTS: BindingQueryOptions = { includeOwnerPid: true, includeTitle: true }
const LIGHT_OPTS: BindingQueryOptions = { includeOwnerPid: false, includeTitle: false }
/** The z-order walk reads the owner PID, so that the tracker can drop the windows of this process. */
const ABOVE_OPTS: BindingQueryOptions = { includeOwnerPid: true, includeTitle: false }
/**
 * The debug log reads the titles of the windows above the target only when its window list changes.
 * Thus the poll loop does not read titles on each tick.
 */
const TITLE_OPTS: BindingQueryOptions = { includeOwnerPid: false, includeTitle: true }

function loadNativeBindings(): Win32Bindings | undefined {
  if (process.platform !== 'win32')
    return undefined

  try {
    return require('@proj-airi/native-window-win32') as Win32Bindings
  }
  catch (err) {
    log.withError(err as Error).warn('Win32 bindings unavailable; falling back to Electron-only tracker')
    return undefined
  }
}

function toWindowMeta(window?: BindingWindowInfo | null): WindowMeta | undefined {
  if (!window)
    return undefined

  const converted = convertWinRectToDip(window.rect)
  if (!converted)
    return undefined

  const { bounds, displayBounds } = converted
  const isOnScreen = window.isVisible && !window.isMinimized && !window.isCloaked && rectsIntersect(bounds, displayBounds)

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
  /**
   * The binding. The first tracker call loads it, so that the app start does not load the native module.
   * `null` means that the load failed. Then each call uses the Electron-only fallback until the app quits.
   */
  private bindings?: Win32Bindings | null
  /** Identifies the last debug log of the windows above the target. The log repeats only when this value changes. */
  private lastAboveLogKey?: string

  private loadBindings(): Win32Bindings | undefined {
    if (this.bindings === undefined)
      this.bindings = loadNativeBindings() ?? null

    return this.bindings ?? undefined
  }

  async listWindows(): Promise<WindowMeta[]> {
    const bindings = this.loadBindings()
    if (!bindings)
      return collectElectronWindows()

    try {
      return toWindowMetas(bindings.listWindows(LIST_OPTS))
    }
    catch (err) {
      log.withError(err).warn('Native window enumeration failed; falling back to Electron-only tracker')
      return collectElectronWindows()
    }
  }

  async getWindowMeta(windowId: string): Promise<WindowMeta | undefined> {
    const bindings = this.loadBindings()
    if (!bindings)
      return (await this.listWindows()).find(window => window.id === windowId)

    try {
      return toWindowMeta(bindings.getWindow(windowId, LIGHT_OPTS))
    }
    catch (err) {
      log.withError(err).warn('Native window lookup failed; falling back to Electron-only tracker')
      const windows = await this.listWindows()
      return windows.find(window => window.id === windowId)
    }
  }

  /**
   * Returns the windows above the target in z-order. The windows of this process are not in the result.
   * Thus AIRI windows, for example the overlay and the main window, do not cover the target for Dock Mode.
   *
   * If the target is the foreground window, the result is empty, and the controller counts the target as frontmost.
   * This also ignores every other window that the walk reports above a foreground target.
   *
   * The foreground check replaces a workaround from commit a7c95d1e2. Its comment in `controller.ts` says that on Win32
   * "the native z-order probe tends to include one extra entry even when the target is already frontmost".
   * The controller then subtracted one window. The owner and the cause of that extra window are not verified on Windows.
   * The own-process filter removes the window only if this process owns it.
   */
  async getWindowsAbove(windowId: string): Promise<WindowMeta[]> {
    const bindings = this.loadBindings()
    if (!bindings)
      return getWindowsAboveElectronTarget(windowId, await this.listWindows())

    try {
      const above = bindings.getWindowsAbove(windowId, ABOVE_OPTS).filter(window => window.ownerPid !== process.pid)

      // NOTICE:
      // If the walk reports an extra window above a frontmost target, the overlay hides.
      // The cause is not verified on Windows.
      // Source: commit a7c95d1e2, which subtracted one window in `controller.ts`.
      // Removal condition: on Windows, the debug log shows no window above a foreground target.
      const isForeground = bindings.getForegroundWindow(LIGHT_OPTS)?.id === windowId
      this.logWindowsAbove(bindings, windowId, above, isForeground)
      return isForeground ? [] : toWindowMetas(above)
    }
    catch (err) {
      log.withError(err).warn('Native z-order probe failed; falling back to Electron-only tracker')
      return getWindowsAboveElectronTarget(windowId, await this.listWindows())
    }
  }

  /**
   * Logs the owner PID, the title, and the extended window style of each window above the target, at debug level.
   * The list has only the windows of other processes, because the own-process filter runs first.
   * A Windows tester can use this log to find the extra window of the NOTICE in `getWindowsAbove`.
   * The poll loop calls the walk each tick, so the log repeats only when the target, the foreground result, or the window list changes.
   */
  private logWindowsAbove(bindings: Win32Bindings, targetId: string, above: BindingWindowInfo[], isForeground: boolean) {
    const key = [targetId, isForeground, ...above.map(window => window.id)].join(' ')
    if (key === this.lastAboveLogKey)
      return

    this.lastAboveLogKey = key
    log.withFields({
      targetId,
      targetIsForeground: isForeground,
      windows: above.map(window => ({
        id: window.id,
        ownerPid: window.ownerPid,
        title: bindings.getWindow(window.id, TITLE_OPTS)?.title,
        exStyle: `0x${window.exStyle.toString(16)}`,
      })),
    }).debug(isForeground ? 'ignored the windows above the foreground target' : 'windows above the target')
  }
}

/**
 * Converts a Win32 window rect in physical screen pixels to DIP bounds, the unit of `BrowserWindow.setBounds`.
 * Returns `undefined` for an empty rect.
 */
function convertWinRectToDip(rect: BindingWindowRect): { bounds: Rectangle, displayBounds: Rectangle } | undefined {
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  if (width <= 0 || height <= 0) {
    return undefined
  }

  // With `null` in place of a window, Electron scales with the display nearest to the rect.
  const bounds = screen.screenToDipRect(null, { x: rect.left, y: rect.top, width, height })
  return { bounds, displayBounds: screen.getDisplayMatching(bounds).bounds }
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
}
