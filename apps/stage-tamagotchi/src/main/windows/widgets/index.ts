import type { BrowserWindow, Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import type {
  WidgetsAddPayload,
  WidgetSnapshot,
  WidgetsUpdatePayload,
} from '../../../shared/eventa'
import type { PluginModuleWidgetPayload } from '../../../shared/eventa/plugin/host'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { safeClose } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow as ElectronBrowserWindow, ipcMain, screen, shell } from 'electron'
import { clamp } from 'es-toolkit/math'
import { isMacOS } from 'std-env'
import { number, object, optional } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { widgetsClearEvent, widgetsRemoveEvent, widgetsRenderEvent, widgetsUpdateEvent } from '../../../shared/eventa'
import { normalizeWidgetWindowSize } from '../../../shared/utils/electron/windows/window-size'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { spotlightLikeWindowConfig, transparentWindowConfig } from '../shared/window'
import { setupWidgetsWindowInvokes } from './rpc/index.electron'

/**
 * Controls the overlay widget window lifecycle and widget registry.
 *
 * Use when:
 * - Electron services need to spawn or update overlay widgets
 * - Renderer invokes need a stable window-management bridge
 *
 * Expects:
 * - A reusable Electron widget window managed by {@link setupWidgetsWindowManager}
 * - Widget ids remain stable across updates for the same widget surface
 *
 * Returns:
 * - An imperative manager for opening the widget window and mutating widget state
 */
export interface WidgetsWindowManager {
  /**
   * Resolves the shared widgets window instance.
   *
   * Use when:
   * - A caller needs direct access to the backing Electron window
   *
   * Expects:
   * - The window manager has already been initialized
   *
   * Returns:
   * - The live widgets {@link BrowserWindow}, creating it if necessary
   */
  getWindow: () => Promise<BrowserWindow>
  /**
   * Opens the widgets window, optionally focusing a prepared widget route.
   *
   * Use when:
   * - The caller wants to show the widgets surface without pushing a new widget payload yet
   * - A prepared widget id should restore its dedicated route and layout
   *
   * Expects:
   * - `params.id`, when provided, matches a widget prepared through {@link WidgetsWindowManager.prepareWidgetWindow}
   *
   * Returns:
   * - Resolves after the target window route has been shown
   */
  openWindow: (params?: { id?: string }) => Promise<void>
  /**
   * Inserts or replaces a widget snapshot and renders it in the widgets window.
   *
   * Use when:
   * - A renderer or tool wants to spawn a new overlay widget
   * - A caller has already prepared an id and wants to attach widget content to it
   *
   * Expects:
   * - `payload.componentName` identifies a registered renderer widget
   *
   * Returns:
   * - The resolved widget id used for subsequent updates or removal
   */
  pushWidget: (payload: WidgetsAddPayload) => Promise<string>
  /**
   * Applies partial widget changes to an existing widget snapshot.
   *
   * Use when:
   * - A widget's props, size, or time-to-live must change without respawning it
   *
   * Expects:
   * - `payload.id` references an existing widget managed by this instance
   *
   * Returns:
   * - Resolves after in-memory state and renderer events have been updated
   */
  updateWidget: (payload: WidgetsUpdatePayload) => Promise<void>
  /**
   * Removes a single widget from the registry and renderer surface.
   *
   * Use when:
   * - A specific widget should disappear immediately
   *
   * Expects:
   * - `id` matches a widget previously created or prepared through this manager
   *
   * Returns:
   * - Resolves after the widget has been removed and the renderer notified
   */
  removeWidget: (id: string) => Promise<void>
  /**
   * Removes all widgets and closes any live widget windows.
   *
   * Use when:
   * - The overlay surface should reset to an empty state
   *
   * Expects:
   * - No additional input
   *
   * Returns:
   * - Resolves after the registry, renderer, and child windows have been cleared
   */
  clearWidgets: () => Promise<void>
  hideWindow: (params?: { id?: string }) => Promise<void>
  /**
   * Reads the current snapshot for a single widget id.
   *
   * Use when:
   * - Another service needs to inspect a widget before opening or mutating it
   *
   * Expects:
   * - `id` is the widget identifier to inspect
   *
   * Returns:
   * - The current snapshot, or `undefined` when the widget is unknown
   */
  getWidgetSnapshot: (id: string) => WidgetSnapshot | undefined
  publishWidgetEvent: (id: string, event: Record<string, unknown>) => void
  onWidgetEvent: (listener: (event: { id: string, event: Record<string, unknown> }) => void) => () => void
  /**
   * Reserves a widget id before content is pushed into the widgets window.
   *
   * Use when:
   * - The caller wants a stable route or window context before rendering
   *
   * Expects:
   * - `options.id`, when provided, should be stable for later reuse
   *
   * Returns:
   * - The prepared widget id bound to a future window context
   */
  prepareWidgetWindow: (options?: { id?: string }) => string
}

const widgetsWindowConfigSchema = object({
  bounds: optional(object({
    x: number(),
    y: number(),
    width: number(),
    height: number(),
  })),
})

type WidgetsWindowConfig = InferOutput<typeof widgetsWindowConfigSchema>

function computeDefaultBounds(): Rectangle {
  const primary = screen.getPrimaryDisplay().workArea
  const width = Math.min(500, Math.floor(primary.width * 0.35))
  const height = Math.min(500, Math.floor(primary.height * 0.6))
  const x = primary.x + primary.width - width - 16
  const y = primary.y + 16
  return { x, y, width, height }
}

function resolveWindowSizeFromPayload(payload: Pick<WidgetsAddPayload, 'componentName' | 'componentProps' | 'windowSize'>) {
  const explicitWindowSize = normalizeWidgetWindowSize(payload.windowSize)
  if (explicitWindowSize)
    return explicitWindowSize

  if (payload.componentName?.trim().toLowerCase() !== 'plugin-module')
    return undefined

  const pluginModulePayload = payload.componentProps as PluginModuleWidgetPayload | undefined
  return normalizeWidgetWindowSize(pluginModulePayload?.windowSize)
}

function createWidgetsWindow() {
  const window = new ElectronBrowserWindow({
    title: 'Widgets',
    width: 620,
    height: 760,
    show: false,
    icon,
    webPreferences: {
      preload: join(getElectronMainDirname(), '../preload/index.mjs'),
      sandbox: false,
    },
    // Top-level overlay style like other overlay windows
    type: 'panel',
    ...transparentWindowConfig(),
    ...spotlightLikeWindowConfig(),
  })

  // Keep on top like caption/main overlays
  window.setAlwaysOnTop(true, 'screen-saver', 1)
  window.setFullScreenable(false)
  window.setVisibleOnAllWorkspaces(true)
  if (isMacOS)
    window.setWindowButtonVisibility(false)

  window.on('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  return window
}

interface WidgetRecord extends WidgetSnapshot {
  timer?: ReturnType<typeof setTimeout>
}

interface WidgetWindowContext {
  widgetId: string
  windowBuilder: () => Promise<BrowserWindow>
  window?: BrowserWindow
}

/**
 * Creates the Electron widgets window manager and its widget registry bridge.
 *
 * Use when:
 * - Main-process services need to spawn, update, or remove overlay widgets
 * - Widget window RPC handlers need a stable manager instance
 *
 * Expects:
 * - `serverChannel` and `i18n` are already initialized for the main process
 * - Renderer widget routes are available under the widgets page
 *
 * Returns:
 * - A {@link WidgetsWindowManager} that coordinates widget state and window reuse
 *
 * Call stack:
 *
 * setupWidgetsWindowManager (./index)
 *   -> {@link createReusableWindow}
 *     -> {@link setupWidgetsWindowInvokes}
 *       -> {@link createContext}
 */
export function setupWidgetsWindowManager(params: {
  serverChannel: ServerChannel
  i18n: I18n
}): WidgetsWindowManager {
  const { setup, get: getConfigRaw, update } = createConfig('windows-widgets', 'config.json', widgetsWindowConfigSchema, {
    default: {},
    autoHeal: true,
  })
  const getConfig = (): WidgetsWindowConfig => getConfigRaw() ?? {}
  setup()

  let eventaContext: ReturnType<typeof createContext>['context'] | undefined
  const widgetRecords = new Map<string, WidgetRecord>()
  const widgetEventListeners = new Set<(event: { id: string, event: Record<string, unknown> }) => void>()
  const windowContexts = new Map<string, WidgetWindowContext>()

  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const defaultRoute = '/widgets'

  let pendingRoute: string | undefined
  let currentRoute: string | undefined
  let activeWidgetsWindow: BrowserWindow | undefined
  let persistWindowBounds = true

  let widgetsManager: WidgetsWindowManager | undefined

  const reusable = createReusableWindow(async () => {
    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)

    const window = createWidgetsWindow()
    activeWidgetsWindow = window
    const { context } = createContext(ipcMain, window)
    eventaContext = context

    const saved = getConfig().bounds
    if (saved) {
      const work = screen.getDisplayMatching(saved).workArea
      const clamped: Rectangle = {
        x: Math.min(Math.max(saved.x, work.x), work.x + work.width - saved.width),
        y: Math.min(Math.max(saved.y, work.y), work.y + work.height - saved.height),
        width: Math.min(saved.width, work.width),
        height: Math.min(saved.height, work.height),
      }
      window.setBounds(clamped)
    }
    else {
      window.setBounds(computeDefaultBounds())
    }

    const persist = () => {
      if (!persistWindowBounds)
        return
      update({ bounds: window.getBounds() })
    }
    window.on('resize', persist)
    window.on('move', persist)

    const initialRoute = pendingRoute ?? defaultRoute
    await setupWidgetsWindowInvokes({
      widgetWindow: window,
      widgetsManager: widgetsManager!,
      i18n: params.i18n,
      serverChannel: params.serverChannel,
    })

    await loadWithRoute(window, initialRoute)

    pendingRoute = undefined

    window.on('closed', () => {
      eventaContext = undefined
      currentRoute = undefined
      if (activeWidgetsWindow === window)
        activeWidgetsWindow = undefined
      windowContexts.forEach((context) => {
        if (context.window === window)
          context.window = undefined
      })
    })
    return window
  })

  /**
   * Reserves a widget id and its window context before rendering.
   *
   * Use when:
   * - The caller wants a stable route for a widget before pushing content
   * - `openWindow({ id })` should target a dedicated widget route
   *
   * Expects:
   * - `options.id`, when supplied, should be reused for future updates
   *
   * Returns:
   * - The prepared widget id
   */
  function prepareWidgetWindow(options?: { id?: string }): string {
    const id = options?.id ?? Math.random().toString(36).slice(2, 10)
    if (!windowContexts.has(id)) {
      windowContexts.set(id, {
        widgetId: id,
        windowBuilder: () => getWindow(),
        window: undefined,
      })
    }
    return id
  }

  function toSnapshot(record: WidgetRecord): WidgetSnapshot {
    const { timer: _timer, ...snapshot } = record
    return snapshot
  }

  function upsertRecord(snapshot: WidgetSnapshot) {
    const existing = widgetRecords.get(snapshot.id)
    if (existing?.timer)
      clearTimeout(existing.timer)

    const record: WidgetRecord = { ...snapshot }

    if (snapshot.ttlMs > 0) {
      record.timer = setTimeout(removeWidgetInternal, snapshot.ttlMs, snapshot.id)
    }

    widgetRecords.set(snapshot.id, record)
  }

  function removeWidgetInternal(id: string, emitEvent = true) {
    const existing = widgetRecords.get(id)
    if (!existing)
      return

    if (existing.timer)
      clearTimeout(existing.timer)

    widgetRecords.delete(id)
    windowContexts.delete(id)

    if (emitEvent) {
      eventaContext?.emit(widgetsRemoveEvent, { id })
    }
  }

  async function loadWithRoute(window: BrowserWindow, route: string) {
    await load(window, withHashRoute(rendererBase, route))
    currentRoute = route
  }

  function applyStoredOrDefaultBounds(window: BrowserWindow) {
    const saved = getConfig().bounds
    if (saved) {
      const work = screen.getDisplayMatching(saved).workArea
      const width = Math.min(saved.width, work.width)
      const height = Math.min(saved.height, work.height)
      const clamped: Rectangle = {
        x: clamp(saved.x, work.x, work.x + work.width - width),
        y: clamp(saved.y, work.y, work.y + work.height - height),
        width,
        height,
      }
      window.setBounds(clamped)
      return
    }

    window.setBounds(computeDefaultBounds())
  }

  function applyWindowLayout(window: BrowserWindow, snapshot?: Pick<WidgetSnapshot, 'windowSize'>) {
    const display = screen.getDisplayMatching(window.getBounds())
    const work = display.workArea
    const windowSize = normalizeWidgetWindowSize(snapshot?.windowSize)

    if (!windowSize) {
      persistWindowBounds = true
      window.setMinimumSize(0, 0)
      window.setMaximumSize(work.width, work.height)
      applyStoredOrDefaultBounds(window)
      return
    }

    persistWindowBounds = false
    const minWidth = clamp(windowSize.minWidth ?? 240, 1, work.width)
    const minHeight = clamp(windowSize.minHeight ?? 160, 1, work.height)
    const maxWidth = clamp(windowSize.maxWidth ?? work.width, minWidth, work.width)
    const maxHeight = clamp(windowSize.maxHeight ?? work.height, minHeight, work.height)
    const width = clamp(windowSize.width ?? minWidth, minWidth, maxWidth)
    const height = clamp(windowSize.height ?? minHeight, minHeight, maxHeight)
    const currentBounds = window.getBounds()

    window.setMinimumSize(minWidth, minHeight)
    window.setMaximumSize(maxWidth, maxHeight)
    window.setBounds({
      x: clamp(currentBounds.x, work.x, work.x + work.width - width),
      y: clamp(currentBounds.y, work.y, work.y + work.height - height),
      width,
      height,
    })
  }

  async function getWindowFromContext(context?: WidgetWindowContext): Promise<BrowserWindow> {
    if (!context)
      return getWindow()
    if (context.window && !context.window.isDestroyed())
      return context.window
    const resolved = await context.windowBuilder()
    context.window = resolved
    return resolved
  }

  async function showWindowWithRoute(route: string, context?: WidgetWindowContext, snapshot?: Pick<WidgetSnapshot, 'windowSize'>) {
    pendingRoute = route
    const window = await getWindowFromContext(context)
    pendingRoute = undefined
    applyWindowLayout(window, snapshot)
    if (currentRoute !== route)
      await loadWithRoute(window, route)
    window.show()
    if (context)
      context.window = window
    return window
  }

  /**
   * Resolves the shared widgets window instance for callers that need direct access.
   *
   * Use when:
   * - Another service needs the backing Electron window without changing widget state
   *
   * Expects:
   * - The reusable window factory is available
   *
   * Returns:
   * - The widgets {@link BrowserWindow}
   */
  async function getWindow(): Promise<BrowserWindow> {
    return reusable.getWindow()
  }

  /**
   * Opens the widgets window and restores a prepared widget route when available.
   *
   * Use when:
   * - The caller wants to reveal the widgets surface without pushing new content
   *
   * Expects:
   * - `params.id`, when provided, references a prepared widget id
   *
   * Returns:
   * - Resolves after the window has been shown
   */
  async function openWindow(params?: { id?: string }) {
    const id = params?.id ? prepareWidgetWindow({ id: params.id }) : undefined
    const route = id ? `${defaultRoute}?id=${id}` : defaultRoute
    const context = id ? windowContexts.get(id) : undefined
    const snapshot = id ? widgetRecords.get(id) : undefined
    await showWindowWithRoute(route, context, snapshot)
  }

  /**
   * Creates or replaces a widget snapshot and renders it in the widget window.
   *
   * Use when:
   * - A renderer or tool wants to spawn overlay content
   *
   * Expects:
   * - `payload.componentName` matches a renderer component known by the widgets page
   *
   * Returns:
   * - The stable widget id that was rendered
   */
  async function pushWidget(payload: WidgetsAddPayload): Promise<string> {
    const id = prepareWidgetWindow({ id: payload.id })
    const snapshot: WidgetSnapshot = {
      id,
      componentName: payload.componentName,
      componentProps: payload.componentProps ?? {},
      size: payload.size ?? 'm',
      windowSize: resolveWindowSizeFromPayload(payload),
      ttlMs: payload.ttlMs ?? 0,
    }
    upsertRecord(snapshot)
    const context = windowContexts.get(id)
    await showWindowWithRoute(`${defaultRoute}?id=${id}`, context, snapshot)
    eventaContext?.emit(widgetsRenderEvent, snapshot)

    return id
  }

  /**
   * Applies partial widget mutations to an existing widget snapshot.
   *
   * Use when:
   * - Props, size, or time-to-live need to change without recreating the widget id
   *
   * Expects:
   * - `payload.id` references an existing widget
   *
   * Returns:
   * - Resolves after internal state and renderer events have been updated
   */
  async function updateWidget(payload: WidgetsUpdatePayload) {
    if (!payload?.id)
      return

    const existing = widgetRecords.get(payload.id)
    if (!existing)
      return

    const nextSnapshot: WidgetSnapshot = {
      ...toSnapshot(existing),
      componentProps: payload.componentProps ?? existing.componentProps,
      size: payload.size ?? existing.size,
      windowSize: normalizeWidgetWindowSize(payload.windowSize) ?? existing.windowSize,
      ttlMs: payload.ttlMs ?? existing.ttlMs,
    }

    upsertRecord(nextSnapshot)

    const context = windowContexts.get(payload.id)
    const window = context?.window
    if (window && !window.isDestroyed())
      applyWindowLayout(window, nextSnapshot)

    eventaContext?.emit(widgetsUpdateEvent, {
      id: nextSnapshot.id,
      componentProps: nextSnapshot.componentProps,
      size: nextSnapshot.size,
      windowSize: nextSnapshot.windowSize,
      ttlMs: nextSnapshot.ttlMs,
    })
  }

  /**
   * Removes one widget and emits the corresponding renderer event.
   *
   * Use when:
   * - A caller needs to dismiss a single widget immediately
   *
   * Expects:
   * - `id` references a widget managed by this instance
   *
   * Returns:
   * - Resolves after the widget has been removed from memory and renderer state
   */
  async function removeWidget(id: string) {
    if (!id)
      return
    removeWidgetInternal(id, false)
    eventaContext?.emit(widgetsRemoveEvent, { id })
  }

  /**
   * Clears every widget and closes all widget windows owned by this manager.
   *
   * Use when:
   * - The overlay surface must reset completely
   *
   * Expects:
   * - No input
   *
   * Returns:
   * - Resolves after state, renderer events, and windows have been cleared
   */
  async function clearWidgets() {
    const ids = [...widgetRecords.keys()]
    for (const id of ids)
      removeWidgetInternal(id, false)

    eventaContext?.emit(widgetsClearEvent, undefined)

    const windowsToClose = new Set<BrowserWindow>()
    if (activeWidgetsWindow && !activeWidgetsWindow.isDestroyed())
      windowsToClose.add(activeWidgetsWindow)

    windowContexts.forEach((context) => {
      if (context.window && !context.window.isDestroyed())
        windowsToClose.add(context.window)
    })

    for (const window of windowsToClose)
      safeClose(window)

    windowContexts.clear()
  }

  /**
   * Reads the current widget snapshot without mutating widget state.
   *
   * Use when:
   * - Another service needs to inspect a widget before deciding what to do next
   *
   * Expects:
   * - `id` is the widget identifier to read
   *
   * Returns:
   * - The widget snapshot, or `undefined` when not found
   */
  function getWidgetSnapshot(id: string) {
    const record = widgetRecords.get(id)
    if (!record)
      return undefined

    return toSnapshot(record)
  }

  function publishWidgetEvent(id: string, event: Record<string, unknown>) {
    for (const listener of widgetEventListeners) {
      listener({ id, event })
    }
  }

  function onWidgetEvent(listener: (event: { id: string, event: Record<string, unknown> }) => void) {
    widgetEventListeners.add(listener)
    return () => {
      widgetEventListeners.delete(listener)
    }
  }

  async function hideWindow(params?: { id?: string }) {
    const id = params?.id
    const context = id ? windowContexts.get(id) : undefined
    const window = context?.window || activeWidgetsWindow
    if (window && !window.isDestroyed())
      window.hide()
  }

  widgetsManager = {
    getWindow,
    openWindow,
    pushWidget,
    updateWidget,
    removeWidget,
    clearWidgets,
    hideWindow,
    getWidgetSnapshot,
    publishWidgetEvent,
    onWidgetEvent,
    prepareWidgetWindow,
  }

  return widgetsManager!
}
