import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { AutoUpdater } from '../../../services/electron/auto-updater'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { createAutoUpdaterService } from '../../../services/electron'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupAboutWindowElectronInvokes(params: {
  window: BrowserWindow
  autoUpdater: AutoUpdater
  i18n: I18n
  serverChannel: ServerChannel
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  await setupBaseWindowElectronInvokes({ context, window: params.window, i18n: params.i18n, serverChannel: params.serverChannel })

  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })
}
