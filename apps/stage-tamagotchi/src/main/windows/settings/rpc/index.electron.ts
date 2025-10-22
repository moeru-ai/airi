import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronOpenSettingsDevtools } from '../../../../shared/eventa'
import { createScreenService, createWindowService } from '../../../services/electron'

export async function setupSettingsWindowInvokes(params: { settingsWindow: BrowserWindow }) {
  const { context } = createContext(ipcMain, params.settingsWindow)

  createScreenService({ context, window: params.settingsWindow })
  createWindowService({ context, window: params.settingsWindow })

  defineInvokeHandler(context, electronOpenSettingsDevtools, async () => params.settingsWindow.webContents.openDevTools({ mode: 'detach' }))
}
