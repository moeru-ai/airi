import type { BrowserWindow } from 'electron'

import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronOpenSettingsDevtools } from '../../../../shared/eventa'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createScreenService, createWindowService } from '../../../services/electron'

export async function setupSettingsWindowInvokes(params: { settingsWindow: BrowserWindow, widgetsManager: WidgetsWindowManager }) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.settingsWindow)

  createScreenService({ context, window: params.settingsWindow })
  createWindowService({ context, window: params.settingsWindow })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.settingsWindow })

  defineInvokeHandler(context, electronOpenSettingsDevtools, async () => params.settingsWindow.webContents.openDevTools({ mode: 'detach' }))
}
