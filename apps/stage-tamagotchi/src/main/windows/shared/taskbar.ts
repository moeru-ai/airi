import type { BrowserWindow } from 'electron'

const excludedWindows = new WeakSet<Pick<BrowserWindow, 'setSkipTaskbar'>>()

/** Marks utility windows that must remain absent when the app icon preference is disabled. */
export function excludeWindowFromTaskbar(window: Pick<BrowserWindow, 'setSkipTaskbar'>): void {
  excludedWindows.add(window)
}

/** Restores ordinary windows without exposing utility or non-focusable windows. */
export function restoreWindowTaskbar(window: Pick<BrowserWindow, 'setSkipTaskbar' | 'isFocusable'>): void {
  window.setSkipTaskbar(excludedWindows.has(window) || !window.isFocusable())
}
