import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { WidgetsWindowManager } from '../../widgets'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { createWidgetsService } from '../../../services/airi/widgets'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupWidgetsWindowInvokes(params: {
  i18n: I18n
  serverChannel: ServerChannel
  widgetsManager: WidgetsWindowManager
  widgetWindow: BrowserWindow
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.widgetWindow)

  setupBaseWindowElectronInvokes({ context, i18n: params.i18n, serverChannel: params.serverChannel, window: params.widgetWindow })

  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.widgetWindow })
}
