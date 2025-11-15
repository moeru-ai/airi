import type { BrowserWindow } from 'electron'

import type { WidgetsWindowManager } from '../../widgets'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { createWidgetsService } from '../../../services/airi/widgets'
import { createScreenService, createWindowService } from '../../../services/electron'

export async function setupWidgetsWindowInvokes(params: { widgetWindow: BrowserWindow, widgetsManager: WidgetsWindowManager }) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.widgetWindow)

  createScreenService({ context, window: params.widgetWindow })
  createWindowService({ context, window: params.widgetWindow })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.widgetWindow })
}
