import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronOpenSettingsDevtools } from '../../../../shared/eventa'
import { createFadeOnHoverService } from '../../../services/fade-on-hover'

export async function setupSettingsWindowInvokes(params: { settingsWindow: BrowserWindow }) {
  const { context } = createContext(ipcMain, params.settingsWindow)

  createFadeOnHoverService(context)
  defineInvokeHandler(context, electronOpenSettingsDevtools, async () => params.settingsWindow.webContents.openDevTools({ mode: 'detach' }))
}
