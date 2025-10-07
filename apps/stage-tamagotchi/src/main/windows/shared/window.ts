import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

import { isMacOS } from 'std-env'

export function toggleWindowShow(window?: BrowserWindow | null): void {
  if (!window) {
    return
  }

  if (window?.isMinimized()) {
    window?.restore()
  }

  window?.show()
  window?.focus()
}

export function transparentWindowConfig(): BrowserWindowConstructorOptions {
  return {
    frame: false,
    titleBarStyle: isMacOS ? 'hidden' : undefined,
    transparent: true,
    hasShadow: false,
  }
}
