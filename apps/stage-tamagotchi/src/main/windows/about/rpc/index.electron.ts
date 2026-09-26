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
  // Each bound context registers listeners on the shared ipcMain instance.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window, { onlySameWindow: true })

  await setupBaseWindowElectronInvokes({ context, window: params.window, i18n: params.i18n, serverChannel: params.serverChannel })

  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })
}
