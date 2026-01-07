import type { BrowserWindow } from 'electron'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { createWindowService } from '../../../services/electron'

export async function setupInlayWindowInvokes(params: {
  inlayWindow: BrowserWindow
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.inlayWindow)

  createWindowService({ context, window: params.inlayWindow })
}
