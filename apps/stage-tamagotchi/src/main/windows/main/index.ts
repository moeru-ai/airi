import type { Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import type { I18n } from '../../libs/i18n'
import type { WindowAuthManager } from '../../services/airi/auth'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { GodotStageManager } from '../../services/airi/godot-stage'
import type { McpStdioManager } from '../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { EditorWindowManager } from '../editor'
import type { NoticeWindowManager } from '../notice'
import type { OnboardingWindowManager } from '../onboarding'
import type { SettingsWindowManager } from '../settings'
import type { WidgetsWindowManager } from '../widgets'

import { dirname, join, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { is } from '@electron-toolkit/utils'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { defu } from 'defu'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { isLinux, isMacOS } from 'std-env'
import { array, number, object, optional, string } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { electronStartDraggingWindow } from '../../../shared/eventa'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { baseUrl, getElectronMainDirname, load } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { protectPrivilegedWindowNavigation, transparentWindowConfig } from '../shared'
import { rectanglesOverlap, restoreWindowBounds } from '../shared/display'
import { setupMainWindowElectronInvokes } from './rpc/index.electron'

const appConfigSchema = object({
  windows: optional(array(object({
    title: optional(string()),
    tag: string(),
    x: optional(number()),
    y: optional(number()),
    width: optional(number()),
    height: optional(number()),
  }))),
})

type AppConfig = InferOutput<typeof appConfigSchema>

export async function setupMainWindow(params: {
  editorWindow: EditorWindowManager
  settingsWindow: SettingsWindowManager
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpStdioManager: McpStdioManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
  windowAuthManager: WindowAuthManager
}) {
  const {
    setup: setupConfig,
    get: getConfigRaw,
    update: updateConfig,
  } = createConfig('app', 'config.json', appConfigSchema, {
    default: { windows: [] },
    autoHeal: true,
  })
  const getConfig = (): AppConfig => getConfigRaw() ?? { windows: [] }

  setupConfig()

  const mainWindowConfig = getConfig().windows?.find(w => w.title === 'AIRI' && w.tag === 'main')
  const mainWindowWidth = Math.max(1, mainWindowConfig?.width ?? 450)
  const mainWindowHeight = Math.max(1, mainWindowConfig?.height ?? 600)
  const savedMainWindowBounds = typeof mainWindowConfig?.x === 'number' && typeof mainWindowConfig?.y === 'number'
    ? {
        x: mainWindowConfig.x,
        y: mainWindowConfig.y,
        width: mainWindowWidth,
        height: mainWindowHeight,
      }
    : undefined

  function restoreMainWindowBounds(savedBounds: Rectangle): Rectangle {
    const fallbackWorkArea = screen.getPrimaryDisplay().workArea
    let matchingWorkArea: Rectangle | undefined

    try {
      const intersectsCurrentDisplay = screen.getAllDisplays().some(display => rectanglesOverlap(savedBounds, display.bounds))
      if (intersectsCurrentDisplay)
        matchingWorkArea = screen.getDisplayMatching(savedBounds).workArea
    }
    catch (error) {
      console.warn('failed to find the display for saved main window bounds, using the primary display:', error)
    }

    return restoreWindowBounds({ savedBounds, matchingWorkArea, fallbackWorkArea })
  }

  const initialMainWindowBounds = savedMainWindowBounds
    ? restoreMainWindowBounds(savedMainWindowBounds)
    : undefined

  const window = new BrowserWindow({
    title: 'AIRI',
    width: initialMainWindowBounds?.width ?? mainWindowWidth,
    height: initialMainWindowBounds?.height ?? mainWindowHeight,
    x: initialMainWindowBounds?.x,
    y: initialMainWindowBounds?.y,
    show: false,
    icon,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      sandbox: false,
    },
    // Thanks to [@HeartArmy](https://github.com/HeartArmy) for the tip implementation.
    //
    // https://github.com/electron/electron/issues/10078#issuecomment-3410164802
    // https://stackoverflow.com/questions/39835282/set-browserwindow-always-on-top-even-other-app-is-in-fullscreen-electron-mac
    type: 'panel',
    ...transparentWindowConfig(),
  })

  if (params.onWindowCreated) {
    params.onWindowCreated(window)
  }

  let allowClose = false
  onAppBeforeQuit(() => {
    allowClose = true
  })

  // NOTICE: in development mode, open devtools by default
  if (is.dev || env.MAIN_APP_DEBUG || env.APP_DEBUG) {
    try {
      window.webContents.openDevTools({ mode: 'detach' })
    }
    catch (err) {
      console.error('failed to open devtools:', err)
    }
  }

  // NOTICE:
  // Bounds recovery is delayed until Electron move/resize events settle so intermediate drag bounds are only persisted.
  // Immediate recovery during every move event clamps the window into the current display before it can cross monitor boundaries.
  // Source/context: apps/stage-tamagotchi window recovery for #2181 and Codex review on moeru-ai/airi#2203.
  // Can be safely deleted if Electron exposes and this code uses a reliable drag-completed event instead.
  const windowBoundsRecoveryDelayMs = 250

  function persistWindowBounds(bounds: Rectangle) {
    const config = getConfig()
    if (!config.windows || !Array.isArray(config.windows)) {
      config.windows = []
    }

    const existingConfigIndex = config.windows.findIndex(w => w.title === 'AIRI' && w.tag === 'main')

    if (existingConfigIndex === -1) {
      config.windows.push({
        title: 'AIRI',
        tag: 'main',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      })
    }
    else {
      const mainWindowConfig = defu(config.windows[existingConfigIndex], { title: 'AIRI', tag: 'main' })

      mainWindowConfig.x = bounds.x
      mainWindowConfig.y = bounds.y
      mainWindowConfig.width = bounds.width
      mainWindowConfig.height = bounds.height

      config.windows[existingConfigIndex] = mainWindowConfig
    }

    updateConfig(config)
  }

  function recoverMainWindowBounds() {
    const currentBounds = window.getBounds()
    const safeBounds = restoreMainWindowBounds(currentBounds)
    if (
      safeBounds.x !== currentBounds.x
      || safeBounds.y !== currentBounds.y
      || safeBounds.width !== currentBounds.width
      || safeBounds.height !== currentBounds.height
    ) {
      window.setBounds(safeBounds)
    }

    persistWindowBounds(safeBounds)
  }

  let moveRecoveryTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleMainWindowBoundsRecovery() {
    if (moveRecoveryTimer)
      clearTimeout(moveRecoveryTimer)

    moveRecoveryTimer = setTimeout(() => {
      moveRecoveryTimer = undefined
      recoverMainWindowBounds()
    }, windowBoundsRecoveryDelayMs)
  }

  window.on('resize', () => {
    persistWindowBounds(window.getBounds())
    scheduleMainWindowBoundsRecovery()
  })
  window.on('move', () => {
    persistWindowBounds(window.getBounds())
    scheduleMainWindowBoundsRecovery()
  })
  if (savedMainWindowBounds)
    persistWindowBounds(window.getBounds())
  window.on('closed', () => {
    if (moveRecoveryTimer) {
      clearTimeout(moveRecoveryTimer)
      moveRecoveryTimer = undefined
    }
  })
  window.on('close', (event) => {
    if (allowClose) {
      return
    }

    event.preventDefault()
    window.hide()
  })

  // Thanks to [@HeartArmy](https://github.com/HeartArmy) for the tip implementation.
  //
  // https://github.com/electron/electron/issues/10078#issuecomment-3410164802
  // https://stackoverflow.com/questions/39835282/set-browserwindow-always-on-top-even-other-app-is-in-fullscreen-electron-mac
  window.setAlwaysOnTop(true, 'screen-saver', 1)
  window.setFullScreenable(false)
  window.setVisibleOnAllWorkspaces(true)
  if (isMacOS) {
    window.setWindowButtonVisibility(false)
  }

  window.on('ready-to-show', () => window!.show())
  protectPrivilegedWindowNavigation(window)

  await setupMainWindowElectronInvokes({
    window,
    editorWindow: params.editorWindow,
    settingsWindow: params.settingsWindow,
    chatWindow: params.chatWindow,
    widgetsManager: params.widgetsManager,
    noticeWindow: params.noticeWindow,
    autoUpdater: params.autoUpdater,
    serverChannel: params.serverChannel,
    godotStageManager: params.godotStageManager,
    mcpStdioManager: params.mcpStdioManager,
    i18n: params.i18n,
    onboardingWindowManager: params.onboardingWindowManager,
    windowAuthManager: params.windowAuthManager,
  })

  await load(window, baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')))

  /**
   * This is a know issue (or expected behavior maybe) to Electron.
   * We don't use this approach on Linux because it's not working.
   *
   * Discussion: https://github.com/electron/electron/issues/37789
   * Workaround: https://github.com/noobfromph/electron-click-drag-plugin
   */
  if (!isLinux) {
    const { default: clickDragPlugin } = await import('electron-click-drag-plugin')

    function handleStartDraggingWindow() {
      try {
        const windowId = window.getNativeWindowHandle()
        clickDragPlugin.startDrag(windowId)
      }
      catch (error) {
        console.error(error)
      }
    }

    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)

    const { context } = createContext(ipcMain, window)
    const cleanUpWindowDraggingInvokeHandler = defineInvokeHandler(context, electronStartDraggingWindow, handleStartDraggingWindow)

    window.on('closed', () => {
      cleanUpWindowDraggingInvokeHandler()
    })
  }

  initScreenCaptureForWindow(window)

  return window
}
