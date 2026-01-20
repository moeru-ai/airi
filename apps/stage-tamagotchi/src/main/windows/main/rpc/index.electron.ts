import type { BrowserWindow } from 'electron'

import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { NoticeWindowManager } from '../../notice'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { tryCatch } from '@moeru/std'
import { ipcMain } from 'electron'

import {
  dockOverlaySyncTheme,
  dockOverlayThemeUpdated,
  electronOpenChat,
  electronOpenMainDevtools,
  electronOpenSettings,
  noticeWindowEventa,
} from '../../../../shared/eventa'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAppService, createAutoUpdaterService, createScreenService, createWindowService } from '../../../services/electron'
import { toggleWindowShow } from '../../shared'

export function setupBaseWindowElectronInvokes(params: {
  context: ReturnType<typeof createContext>['context']
  window: BrowserWindow
}) {
  const screenService = createScreenService({ context: params.context, window: params.window })
  const windowService = createWindowService({ context: params.context, window: params.window })
  createAppService({ context: params.context, window: params.window })

  return { screenService, windowService }
}

export function setupMainWindowElectronInvokes(params: {
  window: BrowserWindow
  settingsWindow: () => Promise<BrowserWindow>
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  dockOverlayContext?: ReturnType<typeof createContext>['context']
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  setupBaseWindowElectronInvokes({ context, window: params.window })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.window })
  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })

  defineInvokeHandler(context, electronOpenMainDevtools, () => params.window.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenSettings, async () => toggleWindowShow(await params.settingsWindow()))
  defineInvokeHandler(context, electronOpenChat, async () => toggleWindowShow(await params.chatWindow()))
  defineInvokeHandler(context, noticeWindowEventa.openWindow, payload => params.noticeWindow.open(payload))

  // One-shot theme sync for Dock overlay (renderer -> main -> overlay)
  defineInvokeHandler(context, dockOverlaySyncTheme, (payload) => {
    tryCatch(() => params.dockOverlayContext?.emit(dockOverlayThemeUpdated, payload))
  })
}
