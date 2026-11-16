import type { BrowserWindow, Rectangle } from 'electron'

import type { createWindowContext } from '../../../libs/electron/window-context'
import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { NoticeWindowManager } from '../../notice'
import type { SettingsWindowManager } from '../../settings'

import { defineInvokeHandler } from '@moeru/eventa'
import { ipcMain } from 'electron'

import {
  electronCenterMainWindow,
  electronControlsMenuHide,
  electronControlsMenuNotificationsRead,
  electronControlsMenuOpenHearing,
  electronControlsMenuPageMounted,
  electronOpenSettings,
  noticeWindowEventa,
} from '../../../../shared/eventa'
import { createAuthService } from '../../../services/airi/auth'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

/** Serves the requests of the menu page: its own lifecycle, and the items of the menu. */
export async function setupControlsMenuWindowInvokes(params: {
  context: ReturnType<typeof createWindowContext>['context']
  window: BrowserWindow
  serverChannel: ServerChannel
  i18n: I18n
  settingsWindow: SettingsWindowManager
  noticeWindow: NoticeWindowManager
  centerMainWindow: () => Rectangle
  onPageMounted: () => void
  hide: () => void
  openHearing: () => void
  notificationsRead: () => void
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = params

  await setupBaseWindowElectronInvokes({
    context,
    window: params.window,
    serverChannel: params.serverChannel,
    i18n: params.i18n,
  })

  // The sign-in item starts a sign-in from this window, and so does a request of another surface.
  createAuthService({ context, window: params.window })

  defineInvokeHandler(context, electronControlsMenuPageMounted, () => params.onPageMounted())
  defineInvokeHandler(context, electronControlsMenuHide, () => params.hide())
  defineInvokeHandler(context, electronControlsMenuOpenHearing, () => params.openHearing())
  defineInvokeHandler(context, electronControlsMenuNotificationsRead, () => params.notificationsRead())
  defineInvokeHandler(context, electronOpenSettings, payload => params.settingsWindow.openWindow(payload?.route))
  defineInvokeHandler(context, noticeWindowEventa.openWindow, payload => params.noticeWindow.open(payload))
  defineInvokeHandler(context, electronCenterMainWindow, () => params.centerMainWindow())
}
