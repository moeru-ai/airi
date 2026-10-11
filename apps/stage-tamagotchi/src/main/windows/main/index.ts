import type { Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import type { MainWindowFullscreenSurface } from '../../../shared/eventa'
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
import type { NoticeWindowManager } from '../notice'
import type { OnboardingWindowManager } from '../onboarding'
import type { SettingsWindowManager } from '../settings'
import type { SpotlightWindowManager } from '../spotlight'
import type { WidgetsWindowManager } from '../widgets'

import { dirname, join, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { is } from '@electron-toolkit/utils'
import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { animate, cubicBezier, utils } from 'animejs'
import { defu } from 'defu'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { isLinux, isMacOS } from 'std-env'
import { array, number, object, optional, string } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { electronMainWindowCloseFullscreen, electronMainWindowEnterFullscreen, electronMainWindowExitFullscreen, electronMainWindowFullscreenSurfaceChanged, electronMainWindowGetFullscreenState, electronMainWindowOpenFullscreen, electronMainWindowSetFullscreenBounds, electronMainWindowSetFullscreenEnabled, electronStartDraggingWindow } from '../../../shared/eventa'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { protectPrivilegedWindowNavigation, setWindowAlwaysOnTop, transparentWindowConfig } from '../shared'
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
  chatWindow: ChatWindowManager
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpManager: McpManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
  ioTraceRecording: IOTraceRecordingService
  inlayWindow: () => Promise<BrowserWindow>
  devtoolsWindow: DevtoolsWindowManager
  globalShortcut: GlobalShortcutService
  spotlightWindow: SpotlightWindowManager
  /**
   * Receives the function that shows a surface in fullscreen mode, for the settings entry points of the app. It
   * returns `false` while the fullscreen mode experiment is off, so the caller opens the settings window instead.
   */
  onFullscreenOpener?: (open: (surface: MainWindowFullscreenSurface, route?: string) => boolean) => void
  /** Reports when fullscreen mode starts and ends. */
  onFullscreenChange?: (active: boolean) => void
  /** Reports each time the page tells whether the fullscreen mode experiment is on, once a fullscreen chat has left it. */
  onFullscreenEnabled?: (enabled: boolean) => void
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

  const window = new BrowserWindow({
    title: 'AIRI',
    width: mainWindowConfig?.width ?? 450.0,
    height: mainWindowConfig?.height ?? 600.0,
    x: mainWindowConfig?.x,
    y: mainWindowConfig?.y,
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
    type: isMacOS ? 'panel' : undefined,
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

  /** The bounds before fullscreen mode. While it is set, the window covers its display and the config keeps the old bounds. */
  let boundsBeforeFullscreen: Rectangle | undefined

  function handleNewBounds(newBounds: Rectangle) {
    if (boundsBeforeFullscreen)
      return

    const config = getConfig()
    if (!config.windows || !Array.isArray(config.windows)) {
      config.windows = []
    }

    const existingConfigIndex = config.windows.findIndex(w => w.title === 'AIRI' && w.tag === 'main')

    if (existingConfigIndex === -1) {
      config.windows.push({
        title: 'AIRI',
        tag: 'main',
        x: newBounds.x,
        y: newBounds.y,
        width: newBounds.width,
        height: newBounds.height,
      })
    }
    else {
      const mainWindowConfig = defu(config.windows[existingConfigIndex], { title: 'AIRI', tag: 'main' })

      mainWindowConfig.x = newBounds.x
      mainWindowConfig.y = newBounds.y
      mainWindowConfig.width = newBounds.width
      mainWindowConfig.height = newBounds.height

      config.windows[existingConfigIndex] = mainWindowConfig
    }

    updateConfig(config)
  }

  window.on('resize', () => handleNewBounds(window.getBounds()))
  window.on('move', () => handleNewBounds(window.getBounds()))
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
  window.setVisibleOnAllWorkspaces(true)
  if (isMacOS) {
    window.setFullScreenable(false)
    window.setWindowButtonVisibility(false)
  }
  // The pin has one owner. `pinned` is the user's choice, and every pin request goes through `setPinned`. The window
  // is on top only while pinned and out of fullscreen mode, so other apps can come above a fullscreen window.
  let pinned = true
  function applyPin() {
    setWindowAlwaysOnTop(window, pinned && !boundsBeforeFullscreen)
  }
  function setPinned(value: boolean) {
    pinned = value
    applyPin()
  }
  applyPin()

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
    mcpManager: params.mcpManager,
    i18n: params.i18n,
    onboardingWindowManager: params.onboardingWindowManager,
    ioTraceRecording: params.ioTraceRecording,
    inlayWindow: params.inlayWindow,
    devtoolsWindow: params.devtoolsWindow,
    globalShortcut: params.globalShortcut,
    spotlightWindow: params.spotlightWindow,
    setPinned,
  })

  await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/', {
    // The main window page hosts the fullscreen mode, so it routes the fullscreen surfaces under its own page.
    query: { 'synced-leader': 'true', 'fullscreen-host': 'true' },
  }))

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

  // Fullscreen mode covers the work area, and the page shows a surface beside the character. Each step changes the
  // size or the position, never both, or a stale frame makes the stage blink. The mode is all or nothing, and
  // `leaveFullscreen` is the only way out.
  /** What the page shows on the right, as it reports it. */
  let fullscreenSurface: MainWindowFullscreenSurface | undefined
  /** Whether the user turned the fullscreen mode experiment on, as the page reports it. Off until the page reports. */
  let fullscreenEnabled = false
  const fullscreenLog = useLogg('main-window-fullscreen').useGlobalConfig()
  let fullscreenGlide: { animation: ReturnType<typeof animate>, finish: () => void } | undefined

  /** Ends the running glide. Its caller resolves at once, so no step waits on a glide that will never finish. */
  function stopFullscreenGlide() {
    const glide = fullscreenGlide
    fullscreenGlide = undefined
    glide?.animation.pause()
    glide?.finish()
  }

  /** Leaves fullscreen mode. Each caller names its reason, so the log tells why it closed. */
  function leaveFullscreen(reason: string) {
    stopFullscreenGlide()
    fullscreenSurface = undefined
    if (!boundsBeforeFullscreen || window.isDestroyed())
      return
    fullscreenLog.log(`Leaving fullscreen mode: ${reason}`)
    const bounds = boundsBeforeFullscreen
    boundsBeforeFullscreen = undefined
    window.setBounds(bounds)
    applyPin()
    params.chatWindow.setMainWindowCovered(false)
    params.onFullscreenChange?.(false)
  }

  // `onlySameWindow` hears only this window, so no other window can move it or end its fullscreen mode.
  const { context: fullscreenContext } = createContext(ipcMain, window, { onlySameWindow: true })
  const cleanUpEnterFullscreen = defineInvokeHandler(fullscreenContext, electronMainWindowEnterFullscreen, () => {
    if (!boundsBeforeFullscreen) {
      boundsBeforeFullscreen = window.getBounds()
      fullscreenLog.log('Entering fullscreen mode')
      applyPin()
      window.setIgnoreMouseEvents(false)
      params.chatWindow.setMainWindowCovered(true)
      params.onFullscreenChange?.(true)
    }
    return { bounds: window.getBounds(), workArea: screen.getDisplayMatching(boundsBeforeFullscreen).workArea }
  })
  const cleanUpSetFullscreenBounds = defineInvokeHandler(fullscreenContext, electronMainWindowSetFullscreenBounds, (payload) => {
    stopFullscreenGlide()
    // Bounds outside fullscreen mode would leave the window changed with nothing to restore it.
    if (!payload || !boundsBeforeFullscreen || window.isDestroyed())
      throw new Error('The main window is not in fullscreen mode')
    const { bounds, duration, delay, curve } = payload
    if (!duration) {
      window.setBounds(bounds)
      return
    }
    // A glide moves the window and keeps its size, so the page content moves with it and never blinks.
    const start = window.getBounds()
    const state = { x: start.x, y: start.y }
    return new Promise<void>((resolve) => {
      const glide = {
        finish: resolve,
        animation: animate(state, {
          x: bounds.x,
          y: bounds.y,
          duration,
          delay: delay ?? 0,
          ease: curve ? cubicBezier(...curve) : 'outCubic',
          modifier: utils.round(0),
          onRender: () => {
            if (!window.isDestroyed())
              window.setPosition(state.x, state.y)
          },
          onComplete: () => {
            if (fullscreenGlide === glide)
              fullscreenGlide = undefined
            resolve()
          },
        }),
      }
      fullscreenGlide = glide
    })
  })
  const cleanUpSurfaceChanged = defineInvokeHandler(fullscreenContext, electronMainWindowFullscreenSurfaceChanged, (payload) => {
    fullscreenSurface = boundsBeforeFullscreen ? payload?.surface : undefined
  })
  const cleanUpExitFullscreen = defineInvokeHandler(fullscreenContext, electronMainWindowExitFullscreen, payload => leaveFullscreen(payload?.reason ?? 'the page gave no reason'))
  const cleanUpGetFullscreenState = defineInvokeHandler(fullscreenContext, electronMainWindowGetFullscreenState, () => boundsBeforeFullscreen
    ? { home: boundsBeforeFullscreen, workArea: screen.getDisplayMatching(boundsBeforeFullscreen).workArea, surface: fullscreenSurface }
    : undefined)

  const cleanUpSetFullscreenEnabled = defineInvokeHandler(fullscreenContext, electronMainWindowSetFullscreenEnabled, async (payload) => {
    fullscreenEnabled = payload?.enabled ?? false
    // The fullscreen chat mode goes away with the experiment. A chat in it moves to the default mode first, while
    // the page still shows it, so its draft moves too. The page closes the fullscreen mode after this resolves.
    if (!fullscreenEnabled)
      await params.chatWindow.leaveFullscreenMode()
    params.onFullscreenEnabled?.(fullscreenEnabled)
  })

  /**
   * Shows a surface in fullscreen mode, and returns `false` without doing anything while the experiment is off.
   * A hidden or minimized window comes back first, because the surface lives here.
   */
  function openFullscreen(surface: MainWindowFullscreenSurface, route?: string) {
    if (!fullscreenEnabled || window.isDestroyed())
      return false
    if (window.isMinimized())
      window.restore()
    if (!window.isVisible())
      window.show()
    fullscreenContext.emit(electronMainWindowOpenFullscreen, { surface, route })
    return true
  }

  params.onFullscreenOpener?.(openFullscreen)
  params.chatWindow.attachFullscreen({
    window,
    context: fullscreenContext,
    open: () => {
      openFullscreen('chat')
    },
    close: () => {
      if (!window.isDestroyed())
        fullscreenContext.emit(electronMainWindowCloseFullscreen, { surface: 'chat' })
    },
    isShown: () => fullscreenSurface === 'chat',
  })
  // A reload stops the glide that the old page waited on. The new page sets the bounds again.
  window.webContents.on('did-start-loading', stopFullscreenGlide)
  window.webContents.on('render-process-gone', (_, details) => leaveFullscreen(`the renderer stopped (${details.reason})`))
  window.on('closed', () => {
    stopFullscreenGlide()
    cleanUpEnterFullscreen()
    cleanUpSetFullscreenBounds()
    cleanUpSurfaceChanged()
    cleanUpExitFullscreen()
    cleanUpGetFullscreenState()
    cleanUpSetFullscreenEnabled()
  })

  initScreenCaptureForWindow(window)

  return window
}
