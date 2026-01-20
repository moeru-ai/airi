import type { WindowMeta, WindowTracker } from '../window-tracker'

import { collectElectronWindows, getFrontmostElectronWindow, getWindowsAboveElectronTarget } from './electron-fallback'

export class MacOSWindowTracker implements WindowTracker {
  // TODO(@maintainers): Replace BrowserWindow-only fallback with Core Graphics polling + optional AX events.
  async listWindows(): Promise<WindowMeta[]> {
    return collectElectronWindows()
  }

  async getWindowMeta(windowId: string): Promise<WindowMeta | undefined> {
    const windows = await this.listWindows()
    return windows.find(window => window.id === windowId)
  }

  async getWindowsAbove(windowId: string): Promise<WindowMeta[]> {
    const windows = await this.listWindows()
    return getWindowsAboveElectronTarget(windowId, windows)
  }

  async getFrontmostWindow(): Promise<WindowMeta | undefined> {
    const windows = await this.listWindows()
    return getFrontmostElectronWindow(windows)
  }
}
