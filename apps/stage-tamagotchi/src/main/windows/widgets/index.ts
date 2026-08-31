import type { BrowserWindow, Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import type {
  WidgetsAddPayload,
  WidgetsIframeRequestResultPayload,
  WidgetSnapshot,
  WidgetsUpdatePayload,
} from '../../../shared/eventa'
import type { PluginModuleWidgetPayload } from '../../../shared/eventa/plugin/host'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { safeClose } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow as ElectronBrowserWindow, ipcMain, screen } from 'electron'
import { clamp } from 'es-toolkit/math'
import { isMacOS } from 'std-env'
import { number, object, optional } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { widgetsClearEvent, widgetsIframeRequestEvent, widgetsRemoveEvent, widgetsRenderEvent, widgetsUpdateEvent } from '../../../shared/eventa'
import { normalizeWidgetWindowSize } from '../../../shared/utils/electron/windows/window-size'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { protectPrivilegedWindowNavigation, setWindowAlwaysOnTop, spotlightLikeWindowConfig, transparentWindowConfig } from '../shared/window'
import { createWidgetIframeRequestCoordinator } from './iframe-request-coordinator'
import { setupWidgetsWindowInvokes } from './rpc/index.electron'

/**
 * Controls each overlay widget instance and its Electron window.
 *
 * Use when:
 * - Electron services need to spawn or update overlay widgets
 * - Renderer invokes need one lifecycle owner for widget state and windows
 *
 * Expects:
 * - Widget ids identify one widget instance and its window
 *
 * Returns:
 * - A manager that opens, updates, and destroys widget instances
 */
export interface WidgetsWindowManager {
  /**
   * Resolves the default widgets window.
   *
   * Use when:
   * - A caller needs direct access to the backing Electron window
   *
   * Expects:
   * - The window manager has already been initialized
   *
   * Returns:
   * - The live default widgets {@link BrowserWindow}, creating it if necessary
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
   * Creates a widget instance and renders it in its own window.
   *
   * Use when:
   * - A renderer or tool wants to spawn a new overlay widget
   * - A caller has already prepared an id and wants to attach widget content
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
   * - Resolves after the widget record and its Electron window are destroyed
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
   * Sends a correlated request to a mounted widget iframe through the widgets renderer.
   *
   * Use when:
   * - Main-process gamelet orchestration needs a response from iframe code
   *
   * Expects:
   * - `id` references an open widget with a mounted iframe relay
   *
   * Returns:
   * - Resolves with the iframe response record, or rejects on timeout, close, or iframe error
   */
  requestWidgetIframe: <TResponse extends Record<string, unknown> = Record<string, unknown>>(
    id: string,
    payload: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ) => Promise<TResponse>
  /**
   * Publishes a renderer-to-main iframe request result into the pending request coordinator.
   *
   * Use when:
   * - The widgets renderer reports a completed iframe request
   *
   * Expects:
   * - `result.requestId` matches a request previously emitted by {@link WidgetsWindowManager.requestWidgetIframe}
   *
   * Returns:
   * - Nothing; unknown or mismatched results are ignored
   */
  publishWidgetIframeRequestResult: (result: WidgetsIframeRequestResultPayload) => void
  /**
   * Reserves a widget id before content is pushed into the widgets window.
   *
   * Use when:
   * - The caller wants a stable route or window context before rendering
   *
   * Expects:
   * - `options.id`, when provided, identifies the reserved widget instance
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
    type: isMacOS ? 'panel' : undefined,
    ...transparentWindowConfig(),
    ...spotlightLikeWindowConfig(),
  })

  window.setFullScreenable(false)
  window.setVisibleOnAllWorkspaces(true)
  if (isMacOS)
    window.setWindowButtonVisibility(false)

  window.on('ready-to-show', () => window.show())
  protectPrivilegedWindowNavigation(window)

  return window
}

interface WidgetRecord extends WidgetSnapshot {
  timer?: ReturnType<typeof setTimeout>
}

interface WidgetWindowContext {
  widgetId: string
  currentRoute?: string
  disposeInvokes?: () => void
  eventa?: ReturnType<typeof createContext>
  persistBounds: boolean
  window?: BrowserWindow
  windowSetupPromise?: Promise<BrowserWindow>
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
 * - A {@link WidgetsWindowManager} that owns widget state and per-instance windows
 *
 * Call stack:
 *
 * setupWidgetsWindowManager (./index)
 *   -> createWindowForContext (./index)
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

  const widgetRecords = new Map<string, WidgetRecord>()
  const widgetEventListeners = new Set<(event: { id: string, event: Record<string, unknown> }) => void>()
  const windowContexts = new Map<string, WidgetWindowContext>()
  const defaultWindowContext: WidgetWindowContext = {
    widgetId: '',
    persistBounds: true,
  }
  const iframeRequests = createWidgetIframeRequestCoordinator({
    hasWidget: id => widgetRecords.has(id),
    hasRelay: id => Boolean(windowContexts.get(id)?.eventa),
    emitRequest: payload => windowContexts.get(payload.id)?.eventa?.context.emit(widgetsIframeRequestEvent, payload),
  })

  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const defaultRoute = '/widgets'

  let widgetsManager: WidgetsWindowManager | undefined

  /**
   * Reserves a widget id and its window context before rendering.
   *
   * Use when:
   * - The caller wants a stable route for a widget before pushing content
   * - `openWindow({ id })` should target a dedicated widget route
   *
   * Expects:
   * - `options.id`, when supplied, identifies the reserved widget instance
   *
   * Returns:
   * - The prepared widget id
   */
  function prepareWidgetWindow(options?: { id?: string }): string {
    const id = options?.id ?? Math.random().toString(36).slice(2, 10)
    if (!windowContexts.has(id)) {
      windowContexts.set(id, {
        widgetId: id,
        persistBounds: true,
      })
    }
    return id
  }

  function toSnapshot(record: WidgetRecord): WidgetSnapshot {
    const { timer: _timer, ...snapshot } = record
    return snapshot
  }

  function scheduleDestruction(record: WidgetRecord) {
    if (record.timer)
      clearTimeout(record.timer)

    record.timer = record.ttlMs > 0
      ? setTimeout(destroyWidget, record.ttlMs, record.id)
      : undefined
  }

  function createRecord(snapshot: WidgetSnapshot) {
    const record: WidgetRecord = { ...snapshot }
    scheduleDestruction(record)
    widgetRecords.set(snapshot.id, record)
  }

  // Each widget id owns one record, one timer, and one window context.
  // Delete the owned state before window.close() so the closed handler can safely re-enter this operation.
  function destroyWidget(id: string) {
    const record = widgetRecords.get(id)
    const windowContext = windowContexts.get(id)
    if (!record && !windowContext)
      return

    if (record?.timer)
      clearTimeout(record.timer)

    widgetRecords.delete(id)
    windowContexts.delete(id)
    iframeRequests.rejectPendingWidgetIframeRequests(id)
    windowContext?.eventa?.context.emit(widgetsRemoveEvent, { id })

    const window = windowContext?.window
    if (window && !window.isDestroyed())
      safeClose(window)
  }

  async function loadWithRoute(windowContext: WidgetWindowContext, window: BrowserWindow, route: string) {
    await load(window, withHashRoute(rendererBase, route, {
      query: { 'synced-leader': 'false' },
    }))
    windowContext.currentRoute = route
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

  function applyWindowLayout(windowContext: WidgetWindowContext, window: BrowserWindow, snapshot?: Pick<WidgetSnapshot, 'windowSize'>) {
    const display = screen.getDisplayMatching(window.getBounds())
    const work = display.workArea
    const windowSize = normalizeWidgetWindowSize(snapshot?.windowSize)

    if (!windowSize) {
      windowContext.persistBounds = true
      window.setMinimumSize(0, 0)
      window.setMaximumSize(work.width, work.height)
      applyStoredOrDefaultBounds(window)
      return
    }

    windowContext.persistBounds = false
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

  async function createWindowForContext(windowContext: WidgetWindowContext, initialRoute: string): Promise<BrowserWindow> {
    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)

    const window = createWidgetsWindow()
    windowContext.window = window
    windowContext.eventa = createContext(ipcMain, window)

    /**
     * Releases the state owned by one closed widget window.
     *
     * Triggering workflow:
     *
     * {@link BrowserWindow}
     *   -> `window.on`
     *     -> `closed`
     *       -> handleWindowClosed
     *
     * Upstream:
     * - The Electron `closed` event from this widget window
     *
     * Downstream:
     * - {@link destroyWidget}
     * - The Eventa adapter `dispose` operation
     */
    function handleWindowClosed() {
      windowContext.disposeInvokes?.()
      windowContext.disposeInvokes = undefined
      windowContext.eventa?.dispose()
      windowContext.eventa = undefined
      windowContext.currentRoute = undefined
      windowContext.window = undefined

      if (windowContext.widgetId)
        destroyWidget(windowContext.widgetId)
    }

    window.on('closed', handleWindowClosed)
    applyStoredOrDefaultBounds(window)

    const persist = () => {
      if (windowContext.persistBounds)
        update({ bounds: window.getBounds() })
    }
    window.on('resize', persist)
    window.on('move', persist)

    try {
      const disposeInvokes = await setupWidgetsWindowInvokes({
        widgetWindow: window,
        widgetsManager: widgetsManager!,
        i18n: params.i18n,
        serverChannel: params.serverChannel,
      })
      if (window.isDestroyed()) {
        disposeInvokes()
        return window
      }
      windowContext.disposeInvokes = disposeInvokes

      await loadWithRoute(windowContext, window, initialRoute)
      return window
    }
    catch (error) {
      if (!window.isDestroyed())
        safeClose(window)
      throw error
    }
  }

  async function getWindowFromContext(windowContext: WidgetWindowContext, initialRoute: string): Promise<BrowserWindow> {
    if (windowContext.window && !windowContext.window.isDestroyed())
      return windowContext.window
    if (windowContext.windowSetupPromise)
      return windowContext.windowSetupPromise

    windowContext.windowSetupPromise = createWindowForContext(windowContext, initialRoute)
      .finally(() => {
        windowContext.windowSetupPromise = undefined
      })
    return windowContext.windowSetupPromise
  }

  async function showWindowWithRoute(route: string, windowContext: WidgetWindowContext, snapshot?: Pick<WidgetSnapshot, 'alwaysOnTop' | 'windowSize'>) {
    const window = await getWindowFromContext(windowContext, route)
    applyWindowLayout(windowContext, window, snapshot)
    setWindowAlwaysOnTop(window, snapshot?.alwaysOnTop ?? false)
    if (windowContext.currentRoute !== route)
      await loadWithRoute(windowContext, window, route)
    window.show()
    return window
  }

  /**
   * Resolves the default widgets window for callers that need direct access.
   *
   * Use when:
   * - Another service needs the backing Electron window without changing widget state
   *
   * Expects:
   * - The renderer widgets route is available
   *
   * Returns:
   * - The widgets {@link BrowserWindow}
   */
  async function getWindow(): Promise<BrowserWindow> {
    return getWindowFromContext(defaultWindowContext, defaultRoute)
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
    const windowContext = id ? windowContexts.get(id)! : defaultWindowContext
    const snapshot = id ? widgetRecords.get(id) : undefined
    await showWindowWithRoute(route, windowContext, snapshot)
  }

  /**
   * Creates a widget instance and renders it in its own window.
   *
   * Use when:
   * - A renderer or tool wants to spawn overlay content
   *
   * Expects:
   * - `payload.componentName` matches a renderer component known by the widgets page
   *
   * Returns:
   * - The widget instance id that was rendered
   */
  async function pushWidget(payload: WidgetsAddPayload): Promise<string> {
    const id = payload.id ?? Math.random().toString(36).slice(2, 10)
    if (widgetRecords.has(id))
      destroyWidget(id)

    prepareWidgetWindow({ id })
    const snapshot: WidgetSnapshot = {
      id,
      componentName: payload.componentName,
      componentProps: payload.componentProps ?? {},
      alwaysOnTop: payload.alwaysOnTop ?? false,
      size: payload.size ?? 'm',
      windowSize: resolveWindowSizeFromPayload(payload),
      ttlMs: payload.ttlMs ?? 0,
    }
    createRecord(snapshot)
    const windowContext = windowContexts.get(id)!
    await showWindowWithRoute(`${defaultRoute}?id=${id}`, windowContext, snapshot)
    windowContext.eventa?.context.emit(widgetsRenderEvent, snapshot)

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
      alwaysOnTop: payload.alwaysOnTop ?? existing.alwaysOnTop,
      size: payload.size ?? existing.size,
      windowSize: normalizeWidgetWindowSize(payload.windowSize) ?? existing.windowSize,
      ttlMs: payload.ttlMs ?? existing.ttlMs,
    }

    const nextRecord: WidgetRecord = {
      ...nextSnapshot,
      timer: existing.timer,
    }
    if (payload.ttlMs !== undefined)
      scheduleDestruction(nextRecord)
    widgetRecords.set(payload.id, nextRecord)

    const windowContext = windowContexts.get(payload.id)
    const window = windowContext?.window
    if (window && !window.isDestroyed()) {
      applyWindowLayout(windowContext, window, nextSnapshot)
      setWindowAlwaysOnTop(window, nextSnapshot.alwaysOnTop)
    }

    windowContext?.eventa?.context.emit(widgetsUpdateEvent, {
      id: nextSnapshot.id,
      componentProps: nextSnapshot.componentProps,
      alwaysOnTop: nextSnapshot.alwaysOnTop,
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
   * - Resolves after the widget record and its Electron window are destroyed
   */
  async function removeWidget(id: string) {
    if (!id)
      return
    destroyWidget(id)
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
    const ids = [...windowContexts.keys()]
    for (const id of ids)
      destroyWidget(id)

    defaultWindowContext.eventa?.context.emit(widgetsClearEvent, undefined)
    const defaultWindow = defaultWindowContext.window
    if (defaultWindow && !defaultWindow.isDestroyed())
      safeClose(defaultWindow)
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

  function requestWidgetIframe<TResponse extends Record<string, unknown> = Record<string, unknown>>(
    id: string,
    payload: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ) {
    return iframeRequests.requestWidgetIframe<TResponse>(id, payload, options)
  }

  function publishWidgetIframeRequestResult(result: WidgetsIframeRequestResultPayload) {
    iframeRequests.publishWidgetIframeRequestResult(result)
  }

  async function hideWindow(params?: { id?: string }) {
    const id = params?.id
    const windowContext = id ? windowContexts.get(id) : defaultWindowContext
    const window = windowContext?.window
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
    requestWidgetIframe,
    publishWidgetIframeRequestResult,
    prepareWidgetWindow,
  }

  return widgetsManager!
}
