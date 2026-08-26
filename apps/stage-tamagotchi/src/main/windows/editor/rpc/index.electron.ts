import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { setupBaseWindowElectronInvokes } from '../../shared/window'

/**
 * Registers only the Electron services required by the empty editor shell.
 * Feature-specific RPC handlers should be added here as the editor gains capabilities.
 */
export async function setupEditorWindowInvokes(params: {
  i18n: I18n
  serverChannel: ServerChannel
  window: BrowserWindow
}) {
  // TODO: Remove this once Eventa supports window-namespaced Electron contexts.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  await setupBaseWindowElectronInvokes({
    context,
    i18n: params.i18n,
    serverChannel: params.serverChannel,
    window: params.window,
  })

  return context
}
