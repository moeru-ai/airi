import type { BrowserWindow as ElectronBrowserWindow, Event } from 'electron'

import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'

import { app, BrowserWindow } from 'electron'
import { isMacOS, isWindows } from 'std-env'

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
 * Use this function instead of `window.setVisibleOnAllWorkspaces(true)`.
 * The Electron default changes the macOS process type, and that change shows the Dock icon again.
 */
export function showWindowOnAllWorkspaces(
  window: Pick<ElectronBrowserWindow, 'setVisibleOnAllWorkspaces'>,
  options: Parameters<ElectronBrowserWindow['setVisibleOnAllWorkspaces']>[1] = {},
): void {
  window.setVisibleOnAllWorkspaces(true, {
    ...options,
    skipTransformProcessType: isMacOS && app.dock?.isVisible() === false,
  })
}

/**
 * Applies the opt-in `hideAppIcon` preference to the macOS Dock and the Windows taskbar.
 *
 * The app config holds the preference. Create this class only after the tray exists,
 * because the tray is then the only way to open windows or quit.
 */
export class AppIconVisibility {
  constructor(private readonly config: Config<typeof globalAppConfigSchema>) {
    // Windows has no app-level icon. Each window owns its taskbar entry,
    // so later windows must get the same treatment as the current ones.
    if (isWindows)
      app.on('browser-window-created', this.onWindowCreated)

    if (this.hidden)
      this.hide()
  }

  get hidden(): boolean {
    return this.config.get()?.hideAppIcon ?? false
  }

  /** Applies the preference to current and later windows, then saves it. */
  async setHidden(hidden: boolean): Promise<void> {
    if (this.hidden === hidden)
      return

    if (hidden)
      this.hide()
    else
      await this.show()

    this.config.update({ ...this.config.get(), hideAppIcon: hidden })
  }

  /** Stops the window listener. Call it before the tray is destroyed. */
  dispose(): void {
    app.off('browser-window-created', this.onWindowCreated)
  }

  private readonly onWindowCreated = (_event: Event, window: ElectronBrowserWindow): void => {
    if (this.hidden)
      window.setSkipTaskbar(true)
  }

  private hide(): void {
    app.dock?.hide()

    if (!isWindows)
      return
    for (const window of BrowserWindow.getAllWindows())
      window.setSkipTaskbar(true)
  }

  private async show(): Promise<void> {
    await app.dock?.show()

    if (!isWindows)
      return
    for (const window of BrowserWindow.getAllWindows())
      window.setSkipTaskbar(taskbarExcludedWindows.has(window) || !window.isFocusable())
  }
}
