import type { BrowserWindow } from 'electron'

import { autoUpdater } from 'electron'

import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

/**
 * Hides the window when the user closes it, so the app keeps running in the tray. The window closes only when the
 * app quits.
 *
 * A normal quit emits `before-quit` before Electron closes the windows. An update install closes all windows first
 * and emits `before-quit` after them. If the window cancels that close, the app does not quit and the update does not
 * install. `before-quit-for-update` comes before that close, so it also allows the close.
 */
export function hideOnClose(window: BrowserWindow) {
  let quitting = false
  const allowClose = () => {
    quitting = true
  }

  const offBeforeQuit = onAppBeforeQuit(allowClose)
  // electron-updater emits this event on Electron's `autoUpdater` on all platforms, also for the NSIS and Linux installers.
  autoUpdater.on('before-quit-for-update', allowClose)

  window.on('close', (event) => {
    if (quitting)
      return

    event.preventDefault()
    window.hide()
  })

  window.once('closed', () => {
    offBeforeQuit()
    autoUpdater.off('before-quit-for-update', allowClose)
  })
}
