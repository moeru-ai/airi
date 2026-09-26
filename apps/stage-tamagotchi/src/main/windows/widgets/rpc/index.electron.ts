import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { WidgetsWindowManager } from '../../widgets'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { createWidgetsService } from '../../../services/airi/widgets'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

/**
 * Registers Eventa invokes for one widget window and returns their cleanup operation.
 *
 * Call stack:
 *
 * setupWidgetsWindowInvokes (./index.electron)
 *   -> {@link setupBaseWindowElectronInvokes}
 *   -> {@link createWidgetsService}
 *   -> `dispose`
 */
export async function setupWidgetsWindowInvokes(params: {
  widgetWindow: BrowserWindow
  widgetsManager: WidgetsWindowManager
  i18n: I18n
  serverChannel: ServerChannel
}) {
  // Each bound context registers listeners on the shared ipcMain instance.
  ipcMain.setMaxListeners(0)

  const { context, dispose } = createContext(ipcMain, params.widgetWindow, { onlySameWindow: true })

  setupBaseWindowElectronInvokes({ context, window: params.widgetWindow, i18n: params.i18n, serverChannel: params.serverChannel })

  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.widgetWindow })

  return dispose
}
