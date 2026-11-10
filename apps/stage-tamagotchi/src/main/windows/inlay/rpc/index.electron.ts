import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { GlobalShortcutService } from '../../../services/electron/global-shortcut'

import { defineInvokeHandler } from '@moeru/eventa'
import { ipcMain } from 'electron'

import { electronInlayReturnHome } from '../../../../shared/eventa'
import { createWindowContext } from '../../../libs/electron/window-context'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupInlayWindowInvokes(params: {
  inlayWindow: BrowserWindow
  serverChannel: ServerChannel
  i18n: I18n
  /** The inlay registers a global Escape while it shows speech, so Escape interrupts AIRI from any app. */
  globalShortcut: GlobalShortcutService
  /** Places the window at its home position. */
  returnHome: () => void
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createWindowContext(params.inlayWindow)

  await setupBaseWindowElectronInvokes({
    context,
    window: params.inlayWindow,
    serverChannel: params.serverChannel,
    i18n: params.i18n,
  })

  params.globalShortcut.registerWindow({ context, window: params.inlayWindow })

  defineInvokeHandler(context, electronInlayReturnHome, (_, options) => {
    if (params.inlayWindow.webContents.id === options?.raw.ipcMainEvent.sender.id)
      params.returnHome()
  })
}
