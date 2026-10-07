import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronInlayHide } from '../../../../shared/eventa'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupInlayWindowInvokes(params: {
  inlayWindow: BrowserWindow
  serverChannel: ServerChannel
  i18n: I18n
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.inlayWindow)

  await setupBaseWindowElectronInvokes({
    context,
    window: params.inlayWindow,
    serverChannel: params.serverChannel,
    i18n: params.i18n,
  })

  defineInvokeHandler(context, electronInlayHide, (_, options) => {
    if (params.inlayWindow.webContents.id === options?.raw.ipcMainEvent.sender.id)
      params.inlayWindow.hide()
  })
}
