import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronOpenSettingsDevtools } from '../../../../shared/eventa'
import { createScreenService, createWindowService } from '../../../services/electron'

export async function setupSettingsWindowInvokes(params: { settingsWindow: BrowserWindow }) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.settingsWindow)

  createScreenService({ context, window: params.settingsWindow })
  createWindowService({ context, window: params.settingsWindow })

  defineInvokeHandler(context, electronOpenSettingsDevtools, async () => params.settingsWindow.webContents.openDevTools({ mode: 'detach' }))
}
