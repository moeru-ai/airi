import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { GodotStageManager } from '../../services/airi/godot-stage'
import type { IOTraceRecordingService } from '../../services/airi/io-trace-recording'
import type { McpManager } from '../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { GlobalShortcutService } from '../../services/electron/global-shortcut'
import type { DevtoolsWindowManager } from '../devtools'
import type { EditorWindowManager } from '../editor'
import type { SpotlightWindowManager } from '../spotlight'
import type { WidgetsWindowManager } from '../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { BrowserWindow } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { electronOpenMainDevtools, electronSettingsNavigate } from '../../../shared/eventa'
import { SETTINGS_WINDOW_WIDTH } from '../../../shared/settings-window'
import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation, toggleWindowShow } from '../shared'
import { setupSettingsWindowInvokes } from './rpc/index.electron'

export interface SettingsWindowManager {
  getWindow: () => Promise<BrowserWindow>
  openWindow: (route?: string) => Promise<void>
  /** The route that the open settings window shows, or `undefined` while it is closed. */
  shownRoute: () => string | undefined
  /** Closes the settings window when it is open. */
  closeWindow: () => void
}

export function setupSettingsWindowReusableFunc(params: {
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsWindow: DevtoolsWindowManager
  editorWindow: EditorWindowManager
  getMainWindow?: () => BrowserWindow | undefined
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpManager: McpManager
  i18n: I18n
  globalShortcut: GlobalShortcutService
  spotlightWindow: SpotlightWindowManager
  ioTraceRecording: IOTraceRecordingService
}): SettingsWindowManager {
  const defaultRoute = '/settings'
  let currentRoute = defaultRoute
  let settingsContext: Awaited<ReturnType<typeof setupSettingsWindowInvokes>> | undefined

  const reusable = createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Settings',
      width: SETTINGS_WINDOW_WIDTH,
      height: 800.0,
      show: false,
      icon,
      webPreferences: {
        preload: getPreloadPath(),
        sandbox: false,
      },
    })

    if (params.onWindowCreated) {
      params.onWindowCreated(window)
    }

    window.on('ready-to-show', () => window.show())
    protectPrivilegedWindowNavigation(window)

    settingsContext = await setupSettingsWindowInvokes({
      settingsWindow: window,
      widgetsManager: params.widgetsManager,
      autoUpdater: params.autoUpdater,
      devtoolsWindow: params.devtoolsWindow,
      editorWindow: params.editorWindow,
      getMainWindow: params.getMainWindow,
      serverChannel: params.serverChannel,
      godotStageManager: params.godotStageManager,
      mcpManager: params.mcpManager,
      i18n: params.i18n,
      globalShortcut: params.globalShortcut,
      spotlightWindow: params.spotlightWindow,
      ioTraceRecording: params.ioTraceRecording,
    })
    // The Developer page asks for the devtools of the main window. The workspace window shows the same page and opens
    // its own devtools instead, so this handler is not in `setupSettingsWindowInvokes`.
    defineInvokeHandler(settingsContext, electronOpenMainDevtools, () => params.getMainWindow?.()?.webContents.openDevTools({ mode: 'detach' }))

    await load(window, withHashRoute(baseUrl(getRendererRoot()), currentRoute, {
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

  function shownRoute() {
    const window = reusable.getOpenWindow()
    // The page routes with the URL hash, so the hash names the page that shows.
    return window ? new URL(window.webContents.getURL()).hash.slice(1) || defaultRoute : undefined
  }

  return {
    getWindow: reusable.getWindow,
    openWindow,
    shownRoute,
    closeWindow: reusable.close,
  }
}
