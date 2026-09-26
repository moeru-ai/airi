import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupInlayWindowInvokes(params: {
  inlayWindow: BrowserWindow
  serverChannel: ServerChannel
  i18n: I18n
}) {
  // Each bound context registers listeners on the shared ipcMain instance.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.inlayWindow, { onlySameWindow: true })

  await setupBaseWindowElectronInvokes({
    context,
    window: params.inlayWindow,
    serverChannel: params.serverChannel,
    i18n: params.i18n,
  })
}
