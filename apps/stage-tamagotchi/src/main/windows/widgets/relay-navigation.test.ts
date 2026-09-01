import { afterEach, describe, expect, it, vi } from 'vitest'

import { widgetsIframeReadyEvent, widgetsIframeRequestEvent } from '../../../shared/eventa'

const mocks = vi.hoisted(() => {
  const eventHandlers = new Map<unknown, (event: { body?: unknown }) => void>()
  const emittedEvents: Array<{ event: unknown, body: unknown }> = []

  const context = {
    on: vi.fn((event: unknown, handler: (event: { body?: unknown }) => void) => {
      eventHandlers.set(event, handler)
      return () => eventHandlers.delete(event)
    }),
    emit: vi.fn((event: unknown, body: unknown) => {
      emittedEvents.push({ event, body })
    }),
  }

  class MockBrowserWindow {
    webContents = {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      getURL: vi.fn(() => ''),
    }

    private readonly listeners = new Map<string, (...args: unknown[]) => void>()

    on = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      this.listeners.set(event, listener)
      return this
    })

    setFullScreenable = vi.fn()
    setVisibleOnAllWorkspaces = vi.fn()
    setWindowButtonVisibility = vi.fn()
    setBounds = vi.fn()
    getBounds = vi.fn(() => ({ x: 0, y: 0, width: 620, height: 760 }))
    setMinimumSize = vi.fn()
    setMaximumSize = vi.fn()
    setAlwaysOnTop = vi.fn()
    show = vi.fn()
    hide = vi.fn()
    isDestroyed = vi.fn(() => false)

    trigger(event: string) {
      this.listeners.get(event)?.()
    }
  }

  const browserWindow = new MockBrowserWindow()

  return {
    browserWindow,
    context,
    emittedEvents,
    eventHandlers,
    emitReady() {
      eventHandlers.get(widgetsIframeReadyEvent)?.({ body: undefined })
    },
    reset() {
      emittedEvents.length = 0
      eventHandlers.clear()
      context.on.mockClear()
      context.emit.mockClear()
    },
    MockBrowserWindow,
  }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.MockBrowserWindow,
  ipcMain: { setMaxListeners: vi.fn() },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
}))

vi.mock('@moeru/eventa/adapters/electron/main', () => ({
  createContext: vi.fn(() => ({ context: mocks.context })),
}))

vi.mock('@proj-airi/electron-vueuse/main', () => ({
  safeClose: vi.fn(),
}))

vi.mock('../../libs/electron/location', () => ({
  baseUrl: vi.fn(() => ({ file: 'renderer/index.html' })),
  getElectronMainDirname: vi.fn(() => '/tmp/electron'),
  load: vi.fn(async () => undefined),
  withHashRoute: vi.fn((base: unknown, route: string) => ({ base, route })),
}))

vi.mock('../../libs/electron/persistence', () => ({
  createConfig: vi.fn(() => ({
    setup: vi.fn(),
    get: vi.fn(() => undefined),
    update: vi.fn(),
  })),
}))

vi.mock('../../libs/electron/window-manager', () => ({
  createReusableWindow: vi.fn((setup: () => unknown) => {
    let window: unknown
    return {
      getWindow: async () => window ??= await setup(),
    }
  }),
}))

vi.mock('../shared/window', () => ({
  protectPrivilegedWindowNavigation: vi.fn(),
  setWindowAlwaysOnTop: vi.fn(),
  spotlightLikeWindowConfig: vi.fn(() => ({})),
  transparentWindowConfig: vi.fn(() => ({})),
}))

vi.mock('./rpc/index.electron', () => ({
  setupWidgetsWindowInvokes: vi.fn(async () => undefined),
}))

vi.mock('../../../../resources/icon.png?asset', () => ({ default: 'icon' }))

describe('widgets window relay navigation', () => {
  afterEach(() => {
    vi.resetModules()
    mocks.reset()
  })

  it('waits for a fresh renderer-ready event after navigating the reusable window', async () => {
    // ROOT CAUSE:
    //
    // The reusable widgets window can navigate from one widget route to another.
    // Its previous renderer-ready state must not authorize requests for the new renderer.
    const { setupWidgetsWindowManager } = await import('./index')
    const manager = setupWidgetsWindowManager({
      serverChannel: {} as never,
      i18n: {} as never,
    })

    await manager.pushWidget({
      id: 'extension:main',
      componentName: 'extension-ui',
    })
    mocks.emitReady()

    await manager.pushWidget({
      id: 'whiteboard:main',
      componentName: 'whiteboard-gamelet',
    })

    const request = manager.requestWidgetIframe('whiteboard:main', { type: 'create_canvas' }, { timeoutMs: 1000 })
    await Promise.resolve()

    const requestsBeforeReady = mocks.emittedEvents.filter(({ event }) => event === widgetsIframeRequestEvent)
    expect(requestsBeforeReady).toHaveLength(0)

    mocks.emitReady()
    await vi.waitFor(() => {
      const requests = mocks.emittedEvents.filter(({ event }) => event === widgetsIframeRequestEvent)
      expect(requests).toHaveLength(1)
    })

    const requestEvent = mocks.emittedEvents.find(({ event }) => event === widgetsIframeRequestEvent)
    if (!requestEvent)
      throw new Error('Expected a widget iframe request event.')

    manager.publishWidgetIframeRequestResult({
      id: 'whiteboard:main',
      requestId: (requestEvent.body as { requestId: string }).requestId,
      ok: true,
      result: { handled: true },
    })

    await expect(request).resolves.toEqual({ handled: true })
  })
})
