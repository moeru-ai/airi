import type { BrowserWindow as ElectronBrowserWindow, Event } from 'electron'

import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'

import { app, BrowserWindow } from 'electron'
import { isWindows } from 'std-env'

// Electron has no getter for `skipTaskbar`. Utility windows register here,
// so that a restore does not add them to the Windows taskbar.
const taskbarExcludedWindows = new WeakSet<Pick<ElectronBrowserWindow, 'setSkipTaskbar'>>()

/** Keeps a utility window out of the Windows taskbar when the user shows the app icon again. */
export function excludeWindowFromTaskbar(window: Pick<ElectronBrowserWindow, 'setSkipTaskbar'>): void {
  taskbarExcludedWindows.add(window)
}

/**
 * Shows a window on all workspaces. A hidden macOS Dock icon stays hidden.
 *
 * Use this function for each window that can open after the tray exists.
 * The Electron default changes the macOS process type, and that change shows the Dock icon again.
 */
export function showWindowOnAllWorkspaces(window: Pick<ElectronBrowserWindow, 'setVisibleOnAllWorkspaces'>): void {
  // `app.dock` exists only on macOS.
  window.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: app.dock?.isVisible() === false })
}

/**
 * Applies the opt-in `hideAppIcon` preference to the macOS Dock and the Windows taskbar.
 *
 * The app config holds the preference. Create this class only after the tray exists,
 * because the tray is then the only way to open windows or quit.
 * The window listener stays for the lifetime of the app.
 */
export class AppIconVisibility {
  constructor(private readonly config: Config<typeof globalAppConfigSchema>) {
    // Windows has no app-level icon. Each window owns its taskbar entry,
    // so later windows must get the same treatment as the current ones.
    if (isWindows) {
      app.on('browser-window-created', (_event: Event, window: ElectronBrowserWindow) => {
        if (this.hidden)
          window.setSkipTaskbar(true)
      })
    }

    if (this.hidden)
      void this.apply(true)
  }

  get hidden(): boolean {
    return this.config.get()?.hideAppIcon ?? false
  }

  /** Applies the preference to current and later windows, then saves it. */
  async setHidden(hidden: boolean): Promise<void> {
    if (this.hidden === hidden)
      return

    await this.apply(hidden)
    this.config.update({ ...this.config.get(), hideAppIcon: hidden })
  }

  private async apply(hidden: boolean): Promise<void> {
    if (hidden)
      app.dock?.hide()
    else
      await app.dock?.show()

    if (!isWindows)
      return
    for (const window of BrowserWindow.getAllWindows())
      window.setSkipTaskbar(hidden || taskbarExcludedWindows.has(window) || !window.isFocusable())
  }
}
