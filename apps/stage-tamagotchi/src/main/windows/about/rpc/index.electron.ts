import type { BrowserWindow } from 'electron'

import type { AutoUpdater } from '../../../services/electron/auto-updater'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { createAutoUpdaterService } from '../../../services/electron'

export function setupAboutWindowElectronInvokes(params: { window: BrowserWindow, autoUpdater: AutoUpdater }) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })
}
