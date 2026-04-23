import type { I18n } from '../../libs/i18n'
import type { WindowAuthManager } from '../../services/airi/auth'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { McpStdioManager } from '../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { DevtoolsWindowManager } from '../devtools'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { BrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { electronSettingsNavigate } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { toggleWindowShow } from '../shared'
import { setupSettingsWindowInvokes } from './rpc/index.electron'

export interface SettingsWindowManager {
  getWindow: () => Promise<BrowserWindow>
  openWindow: (route?: string) => Promise<void>
}

export function setupSettingsWindowReusableFunc(params: {
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsWindow: DevtoolsWindowManager
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  mcpStdioManager: McpStdioManager
  i18n: I18n
  windowAuthManager: WindowAuthManager
}): SettingsWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const defaultRoute = '/settings'
  let currentRoute = defaultRoute
  let settingsContext: Awaited<ReturnType<typeof setupSettingsWindowInvokes>> | undefined

  const reusable = createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Settings',
      width: 600.0,
      height: 800.0,
      show: false,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
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

    await load(window, withHashRoute(rendererBase, currentRoute))
    settingsContext = await setupSettingsWindowInvokes({
      settingsWindow: window,
      widgetsManager: params.widgetsManager,
      autoUpdater: params.autoUpdater,
      devtoolsWindow: params.devtoolsWindow,
      serverChannel: params.serverChannel,
      mcpStdioManager: params.mcpStdioManager,
      i18n: params.i18n,
      windowAuthManager: params.windowAuthManager,
    })

    window.on('closed', () => {
      if (settingsContext)
        settingsContext = undefined
    })

    initScreenCaptureForWindow(window)

    return window
  })

  async function openWindow(route?: string) {
    if (route) {
      currentRoute = route
    }

    const window = await reusable.getWindow()

    if (route && settingsContext) {
      settingsContext.emit(electronSettingsNavigate, { route })
    }

    toggleWindowShow(window)
  }

  return {
    getWindow: reusable.getWindow,
    openWindow,
  }
}
