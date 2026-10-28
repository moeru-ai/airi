import type { Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import type { FullscreenMode, FullscreenOpenRequest, FullscreenSurfaceId } from '../../../shared/eventa'
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
import type { FullscreenPlace } from '../shared/fullscreen'
import type { SpotlightWindowManager } from '../spotlight'
import type { WidgetsWindowManager } from '../widgets'

import { useLogg } from '@guiiai/logg'
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'
import { animate, cubicBezier, utils } from 'animejs'
import { defu } from 'defu'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { Mutex } from 'es-toolkit/promise'
import { isLinux, isMacOS } from 'std-env'
import { array, number, object, optional, string } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { electronFullscreenExit, electronFullscreenOpen, electronFullscreenPack, electronFullscreenRequestClose, electronFullscreenSetMode, electronFullscreenSurfaceChanged, electronMainWindowEnterFullscreen, electronMainWindowGetFullscreenState, electronMainWindowSetFullscreenBounds, electronStartDraggingWindow } from '../../../shared/eventa'
import { shouldOpenDevTools } from '../../libs/electron/devtools'
import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { createWindowContext } from '../../libs/electron/window-context'
import { setupSettingsPageInvokes } from '../settings/rpc/index.electron'
import { protectPrivilegedWindowNavigation, setWindowAlwaysOnTop, transparentWindowConfig } from '../shared'
import { clampBoundsWithinRect } from '../../../shared/utils/electron/display'
import { centerWindowOnDisplay, computeCenteredWindowBounds } from '../shared/display'
import { hideOnClose } from './hide-on-close'
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
  globalShortcut: GlobalShortcutService
  inlayWindow: () => Promise<BrowserWindow>
  devtoolsWindow: DevtoolsWindowManager
  spotlightWindow: SpotlightWindowManager
  /**
   * Receives the function that shows a surface in fullscreen mode, for the settings entry points of the app. It
   * returns `false` unless the mode is `single-window`, so the caller opens settings elsewhere.
   */
  onFullscreenOpener?: (open: (surface: FullscreenSurfaceId, route?: string) => boolean) => void
  /** Reports when fullscreen mode starts and ends. */
  onFullscreenChange?: (active: boolean) => void
  /**
   * Reports each time the page tells the fullscreen mode that the user chose, and the mode before it. A fullscreen chat
   * has left a mode that went off by then.
   */
  onFullscreenModeChange?: (mode: FullscreenMode, previous: FullscreenMode) => void
  /** Receives the main window as a place of the fullscreen mode, so the mode can move here and away. */
  onFullscreenPlace?: (place: FullscreenPlace) => void
  /**
   * Receives the function that keeps this window above the others. The window of the `multi-window` mode covers the
   * screen, so it asks for it while it is open, and the character stays in view on the desktop.
   */
  onKeepAbove?: (keepAbove: (above: boolean) => void) => void
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
  let initialWidth = mainWindowConfig?.width ?? 450.0
  let initialHeight = mainWindowConfig?.height ?? 600.0
  let initialX = mainWindowConfig?.x
  let initialY = mainWindowConfig?.y
  if (initialX != null && initialY != null) {
    const clamped = clampBoundsWithinRect(
      { x: initialX, y: initialY, width: initialWidth, height: initialHeight },
      screen.getDisplayMatching({ x: initialX, y: initialY, width: initialWidth, height: initialHeight }).workArea,
    )
    initialX = clamped.x
    initialY = clamped.y
    initialWidth = clamped.width
    initialHeight = clamped.height
  }

  const window = new BrowserWindow({
    title: 'AIRI',
    width: initialWidth,
    height: initialHeight,
    x: initialX,
    y: initialY,
    show: false,
    icon,
    webPreferences: {
      preload: getPreloadPath(),
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

  hideOnClose(window)

  if (shouldOpenDevTools()) {
    try {
      window.webContents.openDevTools({ mode: 'detach' })
    }
    catch (err) {
      console.error('failed to open devtools:', err)
    }
  }

  /** The bounds before fullscreen mode. While it is set, the window covers its display and the config keeps the old bounds. */
  let boundsBeforeFullscreen: Rectangle | undefined

  /**
   * Centers the window on its display. In fullscreen mode the window covers the work area, so the bounds that it
   * returns to move to the center instead.
   */
  function centerWindow(): Rectangle {
    if (!boundsBeforeFullscreen)
      return centerWindowOnDisplay(window)
    boundsBeforeFullscreen = computeCenteredWindowBounds({
      displayWorkArea: screen.getDisplayMatching(boundsBeforeFullscreen).workArea,
      windowBounds: boundsBeforeFullscreen,
    })
    return boundsBeforeFullscreen
  }

  function handleNewBounds(newBounds: Rectangle) {
    if (boundsBeforeFullscreen)
      return

    // Keep the whole main window in the work area so the Controls Island (and
    // its Move handle) cannot leave the visible screen. Same clamp path as chat
    // and caption windows.
    const workArea = screen.getDisplayMatching(newBounds).workArea
    const clamped = clampBoundsWithinRect(newBounds, workArea)
    if (
      clamped.x !== newBounds.x
      || clamped.y !== newBounds.y
      || clamped.width !== newBounds.width
      || clamped.height !== newBounds.height
    ) {
      window.setBounds(clamped)
      newBounds = clamped
    }

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

  // Thanks to [@HeartArmy](https://github.com/HeartArmy) for the tip implementation.
  //
  // https://github.com/electron/electron/issues/10078#issuecomment-3410164802
  // https://stackoverflow.com/questions/39835282/set-browserwindow-always-on-top-even-other-app-is-in-fullscreen-electron-mac
  window.setVisibleOnAllWorkspaces(true)
  if (isMacOS) {
    window.setFullScreenable(false)
    window.setWindowButtonVisibility(false)
  }
  // The pin has one owner. `pinned` is the user's choice, and every pin request goes through `setPinned`. A
  // fullscreen window is never on top, so other apps can come above it. The window is also on top while the
  // `multi-window` mode window is open under it.
  let pinned = true
  let keptAbove = false
  function applyPin() {
    setWindowAlwaysOnTop(window, (pinned || keptAbove) && !boundsBeforeFullscreen)
  }
  params.onKeepAbove?.((above) => {
    keptAbove = above
    applyPin()
  })
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
    globalShortcut: params.globalShortcut,
    setPinned,
    center: centerWindow,
  })

  await load(window, withHashRoute(baseUrl(getRendererRoot()), '/', {
    // The main window page hosts the fullscreen mode, so it routes the fullscreen surfaces under its own page.
    query: { 'synced-leader': 'true', 'fullscreen-host': 'main-window' },
  }))

  // The inlay loads once and stays shown, so the first speech does not wait for a window and a page load.
  // It is transparent and click-through until speech starts. Showing it inactive keeps focus in the main window.
  void params.inlayWindow().then((inlay) => {
    if (!inlay.isDestroyed())
      inlay.showInactive()
  }).catch(error => console.error('Failed to prepare the inlay window', error))

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

    const { context } = createWindowContext(window)
    const cleanUpWindowDraggingInvokeHandler = defineInvokeHandler(context, electronStartDraggingWindow, handleStartDraggingWindow)

    window.on('closed', () => {
      cleanUpWindowDraggingInvokeHandler()
    })
  }

  // Fullscreen mode covers the work area, and the page shows a surface beside the character. Each step changes the
  // size or the position, never both, or a stale frame makes the stage blink. The mode is all or nothing, and
  // `leaveFullscreen` is the only way out.
  /** What the page shows on the right, as it reports it. */
  let fullscreenSurface: FullscreenSurfaceId | undefined
  /** The surfaces that the page keeps mounted, shown or hidden, as it reports them. */
  let fullscreenMounted: readonly FullscreenSurfaceId[] = []
  /** The fullscreen mode that the user chose, as the page reports it. Off until the page reports. */
  let fullscreenMode: FullscreenMode = 'off'
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
    fullscreenMounted = []
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

  // `onlySameWindow` hears only this window, so no other window can move it or end its fullscreen mode. The context
  // and its handlers go away when the window closes.
  const { context: fullscreenContext } = createWindowContext(window)
  // In the `single-window` mode the settings pages show in this window, so it answers what they ask of the settings
  // window. This context hears only this window, so a request from the settings window stays with that window.
  setupSettingsPageInvokes({
    context: fullscreenContext,
    window,
    spotlightWindow: params.spotlightWindow,
    devtoolsWindow: params.devtoolsWindow,
  })
  defineInvokeHandler(fullscreenContext, electronMainWindowEnterFullscreen, () => {
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
  defineInvokeHandler(fullscreenContext, electronMainWindowSetFullscreenBounds, (payload) => {
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
            // NOTICE:
            // Above 100% scaling on Windows, `setPosition` reuses the rounded window size, so each call changes it a
            // little. A glide calls it each frame, and the window grows past the work area.
            // Source: https://github.com/electron/electron/issues/9477
            // Removal: Electron keeps the size of a window that `setPosition` moves.
            if (!window.isDestroyed())
              window.setBounds({ x: state.x, y: state.y, width: bounds.width, height: bounds.height })
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
  defineInvokeHandler(fullscreenContext, electronFullscreenSurfaceChanged, (payload) => {
    fullscreenSurface = boundsBeforeFullscreen ? payload?.surface : undefined
    fullscreenMounted = boundsBeforeFullscreen ? payload?.mounted ?? [] : []
  })
  defineInvokeHandler(fullscreenContext, electronFullscreenExit, payload => leaveFullscreen(payload?.reason ?? 'the page gave no reason'))
  defineInvokeHandler(fullscreenContext, electronMainWindowGetFullscreenState, () => boundsBeforeFullscreen
    ? { home: boundsBeforeFullscreen, workArea: screen.getDisplayMatching(boundsBeforeFullscreen).workArea, surface: fullscreenSurface }
    : undefined)

  // Reports apply one at a time and in order. A report that waits for the chat never overwrites a newer one.
  const modeReports = new Mutex()
  defineInvokeHandler(fullscreenContext, electronFullscreenSetMode, async (payload) => {
    await modeReports.acquire()
    try {
      const mode = payload?.mode ?? 'off'
      // The fullscreen chat mode goes away with the experiment. A chat in it moves to the default mode first, while
      // the window that shows it still does, so its draft moves too. The mode changes after that.
      if (mode === 'off')
        await params.chatWindow.leaveFullscreenMode()
      const previous = fullscreenMode
      fullscreenMode = mode
      params.onFullscreenModeChange?.(mode, previous)
    }
    finally {
      modeReports.release()
    }
  })

  /**
   * Shows a surface, or what another host packed, in fullscreen mode. It returns `false` without doing anything unless
   * the mode is `single-window`. A hidden or minimized window comes back first, because the surface lives here.
   */
  function openFullscreen(request: FullscreenOpenRequest) {
    if (fullscreenMode !== 'single-window' || window.isDestroyed())
      return false
    if (window.isMinimized())
      window.restore()
    if (!window.isVisible())
      window.show()
    fullscreenContext.emit(electronFullscreenOpen, request)
    return true
  }

  params.onFullscreenOpener?.((surface, route) => openFullscreen({ surface, route }))
  const requestPack = defineInvoke(fullscreenContext, electronFullscreenPack)
  const requestClose = defineInvoke(fullscreenContext, electronFullscreenRequestClose)
  params.onFullscreenPlace?.({
    pack: async () => boundsBeforeFullscreen && !isRendererUnavailable(window) ? requestPack() : undefined,
    close: async () => isRendererUnavailable(window) || requestClose(),
    open: async (pack) => {
      openFullscreen({ surface: pack.surface, pack })
    },
  })
  params.chatWindow.attachFullscreen({
    window,
    context: fullscreenContext,
    mounted: () => fullscreenMounted,
    isActive: () => fullscreenMode === 'single-window',
  })
  // A reload stops the glide that the old page waited on. The new page sets the bounds again. A route change inside
  // the page keeps its document, so the glide runs on.
  window.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument)
      stopFullscreenGlide()
  })
  window.webContents.on('render-process-gone', (_, details) => leaveFullscreen(`the renderer stopped (${details.reason})`))
  window.on('closed', () => stopFullscreenGlide())

  initScreenCaptureForWindow(window)

  return window
}
