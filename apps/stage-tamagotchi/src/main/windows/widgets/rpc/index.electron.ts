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
  if (params.widgetWindow.isDestroyed?.()) {
    throw new Error('Widget window was closed before setup started')
  }

  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context, dispose } = createContext(ipcMain, params.widgetWindow, { onlySameWindow: true })

  const abortController = new AbortController()
  let onClosed: (() => void) | undefined
  const closedPromise = new Promise<never>((_, reject) => {
    onClosed = () => {
      const error = new Error('Widget window was closed during setup')
      abortController.abort(error)
      reject(error)
    }
    params.widgetWindow.once?.('closed', onClosed)
  })

  try {
    await Promise.race([
      setupBaseWindowElectronInvokes({
        context,
        window: params.widgetWindow,
        i18n: params.i18n,
        serverChannel: params.serverChannel,
        signal: abortController.signal,
      }),
      closedPromise,
    ])
    if (params.widgetWindow.isDestroyed?.()) {
      throw new Error('Widget window was closed during setup')
    }
    createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.widgetWindow })
    return dispose
  }
  catch (error) {
    dispose()
    throw error
  }
  finally {
    if (onClosed) {
      params.widgetWindow.removeListener?.('closed', onClosed)
    }
  }
}
