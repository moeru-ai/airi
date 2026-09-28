import type { BrowserWindow as ElectronBrowserWindow, Event } from 'electron'

import { app, BrowserWindow } from 'electron'
import { isWindows } from 'std-env'

/** Owns taskbar visibility from tray readiness until app shutdown. */
export class TrayAppVisibility {
  constructor() {
    app.dock?.hide()

    if (isWindows) {
      app.on('browser-window-created', this.onWindowCreated)
      for (const window of BrowserWindow.getAllWindows()) {
        window.setSkipTaskbar(true)
      }
    }
  }

  private readonly onWindowCreated = (_event: Event, window: ElectronBrowserWindow): void => {
    window.setSkipTaskbar(true)
  }

  /** Removes the window listener before the tray is destroyed during shutdown. */
  dispose(): void {
    if (isWindows) {
      app.off('browser-window-created', this.onWindowCreated)
    }
  }
}
