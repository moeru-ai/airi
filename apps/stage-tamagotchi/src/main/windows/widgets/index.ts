import type { BrowserWindow, Rectangle } from 'electron'

import type { WidgetsAddPayload, WidgetSnapshot } from '../../../shared/eventa'

import { join, resolve } from 'node:path'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow as ElectronBrowserWindow, ipcMain, screen, shell } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { widgetsClearEvent, widgetsRemoveEvent, widgetsRenderEvent, widgetsUpdateEvent } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { createConfig } from '../shared/persistence'
import { spotlightLikeWindowConfig, transparentWindowConfig } from '../shared/window'
import { setupWidgetsWindowInvokes } from './rpc/index.electron'

export interface WidgetsWindowManager {
  getWindow: () => Promise<BrowserWindow>
  openWindow: (params?: { id?: string }) => Promise<void>
  pushWidget: (payload: WidgetsAddPayload) => Promise<string>
  updateWidget: (payload: { id: string, componentProps?: Record<string, any> }) => Promise<void>
  removeWidget: (id: string) => Promise<void>
  clearWidgets: () => Promise<void>
  getWidgetSnapshot: (id: string) => WidgetSnapshot | undefined
  prepareWidgetWindow: (options?: { id?: string }) => string
}

interface WidgetsWindowConfig {
  bounds?: Rectangle
}

function computeDefaultBounds(): Rectangle {
  const primary = screen.getPrimaryDisplay().workArea
  const width = Math.min(500, Math.floor(primary.width * 0.35))
  const height = Math.min(500, Math.floor(primary.height * 0.6))
  const x = primary.x + primary.width - width - 16
  const y = primary.y + 16
  return { x, y, width, height }
}

function createWidgetsWindow() {
  const window = new ElectronBrowserWindow({
    title: 'Widgets',
    width: 620,
    height: 760,
    show: false,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
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

export function setupWidgetsWindowManager(): WidgetsWindowManager {
  const { setup, get, update } = createConfig<WidgetsWindowConfig>('windows-widgets', 'config.json', { default: {} })
  setup()

  let eventaContext: ReturnType<typeof createContext>['context'] | undefined
  const widgetRecords = new Map<string, WidgetRecord>()
  const windowContexts = new Map<string, WidgetWindowContext>()

  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const defaultRoute = '/widgets'

  let pendingRoute: string | undefined
  let currentRoute: string | undefined

  let widgetsManager: WidgetsWindowManager | undefined

  const reusable = createReusableWindow(async () => {
    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)

    const window = createWidgetsWindow()
    const { context } = createContext(ipcMain, window)
    eventaContext = context

    const saved = get()?.bounds
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

    const persist = () => update({ bounds: window.getBounds() })
    window.on('resize', persist)
    window.on('move', persist)

    const initialRoute = pendingRoute ?? defaultRoute
    await loadWithRoute(window, initialRoute)
    await setupWidgetsWindowInvokes({ widgetWindow: window, widgetsManager: widgetsManager! })
    pendingRoute = undefined

    window.on('closed', () => {
      eventaContext = undefined
      currentRoute = undefined
      windowContexts.forEach((context) => {
        if (context.window === window)
          context.window = undefined
      })
    })
    return window
  })

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
      record.timer = setTimeout(() => removeWidgetInternal(snapshot.id), snapshot.ttlMs)
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

  async function getWindowFromContext(context?: WidgetWindowContext): Promise<BrowserWindow> {
    if (!context)
      return getWindow()
    if (context.window && !context.window.isDestroyed())
      return context.window
    const resolved = await context.windowBuilder()
    context.window = resolved
    return resolved
  }

  async function showWindowWithRoute(route: string, context?: WidgetWindowContext) {
    pendingRoute = route
    const window = await getWindowFromContext(context)
    pendingRoute = undefined
    if (currentRoute !== route)
      await loadWithRoute(window, route)
    window.show()
    if (context)
      context.window = window
    return window
  }

  async function getWindow(): Promise<BrowserWindow> {
    return reusable.getWindow()
  }

  async function openWindow(params?: { id?: string }) {
    const id = params?.id ? prepareWidgetWindow({ id: params.id }) : undefined
    const route = id ? `${defaultRoute}?id=${id}` : defaultRoute
    const context = id ? windowContexts.get(id) : undefined
    await showWindowWithRoute(route, context)
  }

  async function pushWidget(payload: WidgetsAddPayload): Promise<string> {
    const id = prepareWidgetWindow({ id: payload.id })
    const snapshot: WidgetSnapshot = {
      id,
      componentName: payload.componentName,
      componentProps: payload.componentProps ?? {},
      size: payload.size ?? 'm',
      ttlMs: payload.ttlMs ?? 0,
    }
    upsertRecord(snapshot)
    const context = windowContexts.get(id)
    await showWindowWithRoute(`${defaultRoute}?id=${id}`, context)
    eventaContext?.emit(widgetsRenderEvent, snapshot)

    return id
  }

  async function updateWidget(payload: { id: string, componentProps?: Record<string, any> }) {
    if (!payload?.id)
      return

    const existing = widgetRecords.get(payload.id)
    if (!existing)
      return

    const nextSnapshot: WidgetSnapshot = {
      ...toSnapshot(existing),
      componentProps: payload.componentProps ?? existing.componentProps,
    }

    upsertRecord(nextSnapshot)

    eventaContext?.emit(widgetsUpdateEvent, { id: nextSnapshot.id, componentProps: nextSnapshot.componentProps })
  }

  async function removeWidget(id: string) {
    if (!id)
      return
    removeWidgetInternal(id, false)
    eventaContext?.emit(widgetsRemoveEvent, { id })
  }

  async function clearWidgets() {
    const ids = [...widgetRecords.keys()]
    for (const id of ids)
      removeWidgetInternal(id, false)

    eventaContext?.emit(widgetsClearEvent, undefined)
    windowContexts.clear()
  }

  function getWidgetSnapshot(id: string) {
    const record = widgetRecords.get(id)
    if (!record)
      return undefined

    return toSnapshot(record)
  }

  widgetsManager = {
    getWindow,
    openWindow,
    pushWidget,
    updateWidget,
    removeWidget,
    clearWidgets,
    getWidgetSnapshot,
    prepareWidgetWindow,
  }

  return widgetsManager!
}
