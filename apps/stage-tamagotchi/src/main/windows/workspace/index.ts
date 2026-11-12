import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { FullscreenOpenRequest, FullscreenPack, FullscreenSurfaceId } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { GodotStageManager } from '../../services/airi/godot-stage'
import type { IOTraceRecordingService } from '../../services/airi/io-trace-recording'
import type { McpManager } from '../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { GlobalShortcutService } from '../../services/electron/global-shortcut'
import type { ChatWindowManager } from '../chat'
import type { DevtoolsWindowManager } from '../devtools'
import type { EditorWindowManager } from '../editor'
import type { FullscreenPlace } from '../shared/fullscreen'
import type { SpotlightWindowManager } from '../spotlight'
import type { WidgetsWindowManager } from '../widgets'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow, screen } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import {
  electronFullscreenExit,
  electronFullscreenOpen,
  electronFullscreenPack,
  electronFullscreenRequestClose,
  electronFullscreenSurfaceChanged,
  electronOpenMainDevtools,
  electronOpenSettings,
  electronWorkspaceWindowGetOpenRequest,
} from '../../../shared/eventa'
import { focusWindow, isWindowFocusIgnored, showWindow } from '../../libs/electron/focus'
import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { createWindowContext } from '../../libs/electron/window-context'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { setupSettingsWindowInvokes } from '../settings/rpc/index.electron'
import { protectPrivilegedWindowNavigation } from '../shared'

/** The page of the window. A surface without a page of its own, such as the chat, shows on it. */
const WORKSPACE_PAGE = '/workspace'

/** The window of the `multi-window` fullscreen mode. */
export interface WorkspaceWindowManager {
  /** Shows a surface in the window, creating the window when there is none. `route` goes to the surface, such as a settings page. */
  open: (surface: FullscreenSurfaceId, route?: string) => Promise<void>
  /** The window as a place of the fullscreen mode, so the mode can move here and away. */
  place: FullscreenPlace
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
 * - `open`, which shows a surface in the window, and `place`, the window as a place of the fullscreen mode.
 */
export function setupWorkspaceWindowManager(params: {
  chatWindow: ChatWindowManager
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsWindow: DevtoolsWindowManager
  editorWindow: EditorWindowManager
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
  /**
   * What the next window shows first. Its page reads it once when it mounts and opens the surface through the registry,
   * like the main window does.
   */
  let first: FullscreenOpenRequest | undefined
  /** The context of the open window. A request for another surface goes through it. */
  let context: ReturnType<typeof createContext>['context'] | undefined
  /** Asks the page of the open window to pack what it shows, and to close the mode. */
  let requests: { pack: () => Promise<FullscreenPack | undefined>, close: () => Promise<boolean> } | undefined
  /** The surface that the page shows, as it reports it. A reload of the page shows it again. */
  let shown: FullscreenSurfaceId | undefined
  /** The surfaces that the page keeps mounted, shown or hidden, as it reports them. */
  let mounted: readonly FullscreenSurfaceId[] = []

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
        preload: getPreloadPath(),
        sandbox: false,
      },
    })

    params.onWindowCreated?.(window)
    window.on('ready-to-show', () => showWindow(window))
    protectPrivilegedWindowNavigation(window)

    // Settings pages show here, so the window answers what they ask of the settings window.
    await setupSettingsWindowInvokes({
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

    // `onlySameWindow` hears only this window, so no other window can close it or change what it shows.
    const { context: windowContext } = createWindowContext(window)
    context = windowContext
    // The request that opened the window counts once. After a reload, the page shows the surface that it showed before,
    // as the page of the main window does.
    defineInvokeHandler(windowContext, electronWorkspaceWindowGetOpenRequest, () => {
      const request = first ?? (shown ? { surface: shown } : undefined)
      first = undefined
      return request
    })
    defineInvokeHandler(windowContext, electronFullscreenSurfaceChanged, (payload) => {
      shown = payload?.surface
      mounted = payload?.mounted ?? []
    })
    defineInvokeHandler(windowContext, electronFullscreenExit, () => reusable.close())
    const requestPack = defineInvoke(windowContext, electronFullscreenPack)
    const requestClose = defineInvoke(windowContext, electronFullscreenRequestClose)
    requests = { pack: () => requestPack(), close: () => requestClose() }
    // The chat shows here too, so the window answers what a chat renderer asks.
    defineInvokeHandler(windowContext, electronOpenSettings, payload => params.openSettings(payload?.route))
    defineInvokeHandler(windowContext, electronOpenMainDevtools, () => window.webContents.openDevTools({ mode: 'detach' }))
    const detachChat = params.chatWindow.attachFullscreen({
      window,
      context: windowContext,
      mounted: () => mounted,
      isActive: params.isActive,
    })

    window.on('closed', () => {
      detachChat()
      context = undefined
      requests = undefined
      shown = undefined
      mounted = []
      params.onOpenChange?.(false)
    })
    // A page that stopped cannot show the mode, so the mode ends with the window, as it ends in the main window. The
    // next request creates a new window.
    window.webContents.on('render-process-gone', () => {
      if (!window.isDestroyed())
        window.close()
    })

    await load(window, withHashRoute(baseUrl(getRendererRoot()), WORKSPACE_PAGE, {
      query: { 'synced-leader': 'false', 'fullscreen-host': 'workspace-window' },
    }))

    initScreenCaptureForWindow(window)
    params.onOpenChange?.(true)

    return window
  })

  async function open(next: FullscreenSurfaceId, route?: string, pack?: FullscreenPack) {
    const existing = reusable.getOpenWindow()
    if (existing && context) {
      context.emit(electronFullscreenOpen, { surface: next, route, pack })
      if (existing.isMinimized())
        existing.restore()
      focusWindow(existing)
      return
    }

    first = { surface: next, route, pack }
    const window = await reusable.getWindow()
    if (!isWindowFocusIgnored())
      window.focus()
  }

  const place: FullscreenPlace = {
    pack: async () => {
      const window = reusable.getOpenWindow()
      return window && !isRendererUnavailable(window) ? requests?.pack() : undefined
    },
    close: async () => {
      const window = reusable.getOpenWindow()
      if (!window || isRendererUnavailable(window) || !requests) {
        reusable.close()
        return true
      }
      return requests.close()
    },
    open: pack => open(pack.surface, undefined, pack),
  }

  return { open, place }
}
