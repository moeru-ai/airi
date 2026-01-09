import type { BrowserWindow } from 'electron'

import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { DevtoolsWindowManager } from '../../devtools'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { desktopCapturer, ipcMain, session } from 'electron'

import { electronOpenDevtoolsWindow, electronOpenSettingsDevtools, modulesVisionPrepareScreenSourceSelection } from '../../../../shared/eventa'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAutoUpdaterService, createScreenService, createWindowService } from '../../../services/electron'

export async function setupSettingsWindowInvokes(params: {
  settingsWindow: BrowserWindow
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsMarkdownStressWindow: DevtoolsWindowManager
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.settingsWindow)

  createScreenService({ context, window: params.settingsWindow })
  createWindowService({ context, window: params.settingsWindow })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.settingsWindow })
  createAutoUpdaterService({ context, window: params.settingsWindow, service: params.autoUpdater })

  defineInvokeHandler(context, electronOpenSettingsDevtools, async () => params.settingsWindow.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenDevtoolsWindow, async (payload) => {
    await params.devtoolsMarkdownStressWindow.openWindow(payload?.route)
  })

  defineInvokeHandler(context, modulesVisionPrepareScreenSourceSelection, async () => {
    // TODO(@sumimakito): Refactor electron-audio-loopback first then move this to register for beat-sync handler.
    // TODO(@nekomeowww): Currently, beat-sync and vision cannot be used together, as they both overriding the display media request handler.
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        // Grant access to the first screen found.
        callback({ video: sources[0], audio: 'loopback' })
      })
    }, { useSystemPicker: false })
  })
}
