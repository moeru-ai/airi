import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronVoiceInlayHide, electronVoiceInlayShow } from '../../../../shared/eventa'
import { setupBaseWindowElectronInvokes } from '../../shared/window'
import { hideVoiceInlay, presentVoiceInlay } from '../presentation'

export async function setupInlayWindowInvokes(params: {
  inlayWindow: BrowserWindow
  indicatorWindow: () => Promise<BrowserWindow>
  serverChannel: ServerChannel
  i18n: I18n
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.inlayWindow)
  defineInvokeHandler(context, electronVoiceInlayHide, async () => hideVoiceInlay(params.inlayWindow, await params.indicatorWindow()))
  defineInvokeHandler(context, electronVoiceInlayShow, async ({ focus, presentation }) => presentVoiceInlay(params.inlayWindow, await params.indicatorWindow(), presentation, focus))

  await setupBaseWindowElectronInvokes({
    context,
    window: params.inlayWindow,
    serverChannel: params.serverChannel,
    i18n: params.i18n,
  })
}
