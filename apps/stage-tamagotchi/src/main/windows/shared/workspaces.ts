import type { BrowserWindow } from 'electron'

import { app } from 'electron'
import { isMacOS } from 'std-env'

/** Keeps a tray-only macOS app hidden from the Dock when changing workspace visibility. */
export function showWindowOnAllWorkspaces(
  window: Pick<BrowserWindow, 'setVisibleOnAllWorkspaces'>,
  options: Parameters<BrowserWindow['setVisibleOnAllWorkspaces']>[1] = {},
): void {
  window.setVisibleOnAllWorkspaces(true, {
    ...options,
    skipTransformProcessType: isMacOS && app.dock?.isVisible() === false,
  })
}
