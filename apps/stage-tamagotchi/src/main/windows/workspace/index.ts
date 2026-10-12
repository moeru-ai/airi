import type { FullscreenSurfaceId } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { GodotStageManager } from '../../services/airi/godot-stage'
import type { IOTraceRecordingService } from '../../services/airi/io-trace-recording'
import type { McpManager } from '../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { GlobalShortcutService } from '../../services/electron/global-shortcut'
import type { ChatWindowManager } from '../chat'
import type { DevtoolsWindowManager } from '../devtools'
import type { SpotlightWindowManager } from '../spotlight'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { BrowserWindow, ipcMain, screen } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import {
  electronFullscreenClose,
  electronFullscreenExit,
  electronFullscreenGetState,
  electronFullscreenOpen,
  electronFullscreenSurfaceChanged,
  electronOpenMainDevtools,
  electronOpenSettings,
} from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { setupSettingsWindowInvokes } from '../settings/rpc/index.electron'
import { protectPrivilegedWindowNavigation } from '../shared'

/** The page of the window. A surface without a page of its own, such as the chat, shows on it. */
const WORKSPACE_PAGE = '/workspace'
/** The first settings page, for a request that names none. */
const SETTINGS_HOME = '/settings'

/** The window of the `multi-window` fullscreen mode. */
export interface WorkspaceWindowManager {
  /** Shows a surface in the window, creating the window when there is none. `route` goes to the surface, such as a settings page. */
  open: (surface: FullscreenSurfaceId, route?: string) => Promise<void>
  /** Closes the window when it is open. Returns the settings page it showed, so settings can open there elsewhere. */
  close: () => string | undefined
}

/**
 * Owns the window of the `multi-window` fullscreen mode.
 *
 * The window covers the work area of the display that the main window is on, and its page shows the same fullscreen
 * mode as the main window does, around its own view of the character. The main window stays as it is.
 *
 * Use when:
 * - The user chose the `multi-window` mode, and a settings entry point or the fullscreen chat asks for a surface.
 *
 * Expects:
 * - `isActive` answers whether the user chose the `multi-window` mode now.
 *
 * Returns:
 * - The functions that show a surface in the window and close it.
 */
export function setupWorkspaceWindowManager(params: {
  chatWindow: ChatWindowManager
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsWindow: DevtoolsWindowManager
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpManager: McpManager
  i18n: I18n
  globalShortcut: GlobalShortcutService
  spotlightWindow: SpotlightWindowManager
  ioTraceRecording: IOTraceRecordingService
  getMainWindow: () => BrowserWindow | undefined
  isActive: () => boolean
  /** Opens settings where the fullscreen mode says, for a link inside the window. */
  openSettings: (route?: string) => Promise<void>
  onWindowCreated?: (window: BrowserWindow) => void
  /** Reports when the window opens and closes. */
  onOpenChange?: (open: boolean) => void
}): WorkspaceWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  /** What the next window shows first. Its page reads the surface when it mounts, and the route is its first URL. */
  let first: { surface: FullscreenSurfaceId, route?: string } = { surface: 'settings' }
  /** The context of the open window. A request for another surface goes through it. */
  let context: ReturnType<typeof createContext>['context'] | undefined
  /** What the page shows on the right, as it reports it. */
  let surface: FullscreenSurfaceId | undefined
  /** Whether the page keeps the chat mounted, shown or hidden. A mounted chat has a composer that holds the draft. */
  let chatMounted = false

  const reusable = createReusableWindow(async () => {
    const mainWindow = params.getMainWindow()
    const display = mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getPrimaryDisplay()

    const window = new BrowserWindow({
      title: 'AIRI',
      ...display.workArea,
      show: false,
      icon,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      roundedCorners: false,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    params.onWindowCreated?.(window)
    window.on('ready-to-show', () => window.show())
    protectPrivilegedWindowNavigation(window)

    // Settings pages show here, so the window answers what they ask of the settings window.
    await setupSettingsWindowInvokes({
      settingsWindow: window,
      widgetsManager: params.widgetsManager,
      autoUpdater: params.autoUpdater,
      devtoolsWindow: params.devtoolsWindow,
      getMainWindow: params.getMainWindow,
      serverChannel: params.serverChannel,
      godotStageManager: params.godotStageManager,
      mcpManager: params.mcpManager,
      i18n: params.i18n,
      globalShortcut: params.globalShortcut,
      spotlightWindow: params.spotlightWindow,
      ioTraceRecording: params.ioTraceRecording,
    })

    // `onlySameWindow` hears only this window, so no other window can close it or change what it shows.
    const { context: windowContext } = createContext(ipcMain, window, { onlySameWindow: true })
    context = windowContext
    defineInvokeHandler(windowContext, electronFullscreenGetState, () => {
      const bounds = window.getBounds()
      return { home: bounds, workArea: bounds, surface: first.surface }
    })
    defineInvokeHandler(windowContext, electronFullscreenSurfaceChanged, (payload) => {
      surface = payload?.surface
      chatMounted = !!payload?.mounted.includes('chat')
    })
    defineInvokeHandler(windowContext, electronFullscreenExit, () => reusable.close())
    // The chat shows here too, so the window answers what a chat renderer asks.
    defineInvokeHandler(windowContext, electronOpenSettings, payload => params.openSettings(payload?.route))
    defineInvokeHandler(windowContext, electronOpenMainDevtools, () => window.webContents.openDevTools({ mode: 'detach' }))
    const detachChat = params.chatWindow.attachFullscreen({
      window,
      context: windowContext,
      close: () => {
        if (!window.isDestroyed())
          windowContext.emit(electronFullscreenClose, { surface: 'chat' })
      },
      hasChat: () => chatMounted,
      isActive: params.isActive,
    })

    window.on('closed', () => {
      detachChat()
      context = undefined
      surface = undefined
      chatMounted = false
      params.onOpenChange?.(false)
    })

    const route = first.route ?? (first.surface === 'settings' ? SETTINGS_HOME : WORKSPACE_PAGE)
    await load(window, withHashRoute(rendererBase, route, {
      query: { 'synced-leader': 'false', 'fullscreen-host': 'workspace-window' },
    }))

    initScreenCaptureForWindow(window)
    params.onOpenChange?.(true)

    return window
  })

  async function open(next: FullscreenSurfaceId, route?: string) {
    const existing = reusable.getOpenWindow()
    if (existing && context) {
      context.emit(electronFullscreenOpen, { surface: next, route })
      if (existing.isMinimized())
        existing.restore()
      existing.show()
      existing.focus()
      return
    }

    first = { surface: next, route }
    const window = await reusable.getWindow()
    window.focus()
  }

  function close() {
    const window = reusable.getOpenWindow()
    if (!window)
      return undefined
    // The page routes with the URL hash, so the hash names the settings page while settings show.
    const route = surface === 'settings'
      ? new URL(window.webContents.getURL()).hash.slice(1) || SETTINGS_HOME
      : undefined
    reusable.close()
    return route
  }

  return { open, close }
}
