import type { BrowserWindow } from 'electron'

import { createContext } from '@unbird/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { createFadeOnHoverService } from '../../../services/fade-on-hover'

export function setupAppInvokeHandlers(window: BrowserWindow) {
  const eventaContext = createContext(ipcMain, window)
  const { context } = eventaContext

  createFadeOnHoverService(context)
}
