import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { DevtoolsWindowManager } from '../devtools'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { BrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { setupSettingsWindowInvokes } from './rpc/index.electron'

export function setupSettingsWindowReusableFunc(params: {
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsMarkdownStressWindow: DevtoolsWindowManager
  onWindowCreated?: (window: BrowserWindow) => void
}) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Settings',
      width: 600.0,
      height: 800.0,
      show: false,
      icon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
      },
    })

    if (params.onWindowCreated) {
      params.onWindowCreated(window)
    }

    window.on('ready-to-show', () => window.show())
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/settings'))
    await setupSettingsWindowInvokes({
      settingsWindow: window,
      widgetsManager: params.widgetsManager,
      autoUpdater: params.autoUpdater,
      devtoolsMarkdownStressWindow: params.devtoolsMarkdownStressWindow,
    })

    initScreenCaptureForWindow(window)

    return window
  }).getWindow
}
