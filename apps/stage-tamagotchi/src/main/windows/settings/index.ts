import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { GodotStageManager } from '../../services/airi/godot-stage'
import type { McpStdioManager } from '../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { GlobalShortcutService } from '../../services/electron/global-shortcut'
import type { DevtoolsWindowManager } from '../devtools'
import type { SpotlightWindowManager } from '../spotlight'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { BrowserWindow } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { electronSettingsNavigate } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation, toggleWindowShow } from '../shared'
import { setupSettingsWindowInvokes } from './rpc/index.electron'

export interface SettingsWindowManager {
  getWindow: () => Promise<BrowserWindow>
  openWindow: (route?: string) => Promise<void>
}

export function setupSettingsWindowReusableFunc(params: {
  autoUpdater: AutoUpdater
  devtoolsWindow: DevtoolsWindowManager
  getMainWindow?: () => BrowserWindow | undefined
  globalShortcut: GlobalShortcutService
  godotStageManager: GodotStageManager
  i18n: I18n
  mcpStdioManager: McpStdioManager
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  spotlightWindow: SpotlightWindowManager
  widgetsManager: WidgetsWindowManager
}): SettingsWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const defaultRoute = '/settings'
  let currentRoute = defaultRoute
  let settingsContext: Awaited<ReturnType<typeof setupSettingsWindowInvokes>> | undefined

  const reusable = createReusableWindow(async () => {
    const window = new BrowserWindow({
      height: 800.0,
      icon,
      show: false,
      title: 'Settings',
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
      width: 600.0,
    })

    if (params.onWindowCreated) {
      params.onWindowCreated(window)
    }

    window.on('ready-to-show', () => window.show())
    protectPrivilegedWindowNavigation(window)

    settingsContext = await setupSettingsWindowInvokes({
      autoUpdater: params.autoUpdater,
      devtoolsWindow: params.devtoolsWindow,
      getMainWindow: params.getMainWindow,
      globalShortcut: params.globalShortcut,
      godotStageManager: params.godotStageManager,
      i18n: params.i18n,
      mcpStdioManager: params.mcpStdioManager,
      serverChannel: params.serverChannel,
      settingsWindow: window,
      spotlightWindow: params.spotlightWindow,
      widgetsManager: params.widgetsManager,
    })

    await load(window, withHashRoute(rendererBase, currentRoute, {
      query: { 'synced-leader': 'false' },
    }))

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
