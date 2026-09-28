import type { BrowserWindow as ElectronBrowserWindow, Event } from 'electron'

import { app, BrowserWindow } from 'electron'
import { isWindows } from 'std-env'

import { restoreWindowTaskbar } from '../windows/shared/taskbar'

/** Applies the opt-in icon preference while the tray is available. */
export class TrayAppVisibility {
  constructor(private hidden = false) {
    if (hidden)
      app.dock?.hide()

    if (isWindows) {
      app.on('browser-window-created', this.onWindowCreated)
      if (hidden)
        this.applyTaskbarVisibility()
    }
  }

  private readonly onWindowCreated = (_event: Event, window: ElectronBrowserWindow): void => {
    if (this.hidden)
      window.setSkipTaskbar(true)
  }

  /** Changes existing and future window visibility without restarting the app. */
  async setHidden(hidden: boolean): Promise<void> {
    if (this.hidden === hidden)
      return

    if (hidden)
      app.dock?.hide()
    else
      await app.dock?.show()

    this.hidden = hidden
    if (isWindows)
      this.applyTaskbarVisibility()
  }

  private applyTaskbarVisibility(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (this.hidden)
        window.setSkipTaskbar(true)
      else
        restoreWindowTaskbar(window)
    }
  }

  /** Removes the window listener before the tray is destroyed during shutdown. */
  dispose(): void {
    if (isWindows) {
      app.off('browser-window-created', this.onWindowCreated)
    }
  }
}
