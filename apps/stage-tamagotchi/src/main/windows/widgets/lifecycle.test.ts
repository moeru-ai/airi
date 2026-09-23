import type { BrowserWindow, Rectangle } from 'electron'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupWidgetsWindowManager } from './index'

const mocks = vi.hoisted(() => {
  let nextWebContentsId = 1
  const windows: FakeBrowserWindow[] = []

  class FakeBrowserWindow {
    readonly webContents = {
      id: nextWebContentsId++,
      isCrashed: vi.fn(() => false),
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }

    readonly close = vi.fn(() => {
      if (this.destroyed)
        return

      this.destroyed = true
      this.emit('closed')
    })

    readonly getBounds = vi.fn(() => ({ ...this.bounds }))
    readonly hide = vi.fn()
    readonly isDestroyed = vi.fn(() => this.destroyed)
    readonly setAlwaysOnTop = vi.fn()
    readonly setBounds = vi.fn((bounds: Rectangle) => {
      this.bounds = { ...bounds }
    })

    readonly setFullScreenable = vi.fn()
    readonly setMaximumSize = vi.fn()
    readonly setMinimumSize = vi.fn()
    readonly setVisibleOnAllWorkspaces = vi.fn()
    readonly setWindowButtonVisibility = vi.fn()
    readonly show = vi.fn()

    private bounds: Rectangle = { x: 0, y: 0, width: 620, height: 760 }
    private destroyed = false
    private readonly listeners = new Map<string, Array<() => void>>()

    constructor() {
      windows.push(this)
    }

    on(event: string, listener: () => void) {
      const listeners = this.listeners.get(event) ?? []
      listeners.push(listener)
      this.listeners.set(event, listeners)
      return this
    }

    private emit(event: string) {
      for (const listener of this.listeners.get(event) ?? [])
        listener()
    }
  }

  return {
    FakeBrowserWindow,
    reset() {
      windows.length = 0
    },
    windows,
  }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.FakeBrowserWindow,
  ipcMain: {
    off: vi.fn(),
    on: vi.fn(),
    setMaxListeners: vi.fn(),
  },
  screen: {
    getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
    getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
  },
}))

vi.mock('std-env', () => ({ isMacOS: false }))

vi.mock('@moeru/eventa/adapters/electron/main', () => ({
  createContext: vi.fn(() => ({
    context: {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    },
    dispose: vi.fn(),
  })),
}))

vi.mock('@proj-airi/electron-vueuse/main', () => ({
  safeClose: vi.fn((window: BrowserWindow) => {
    window.close()
    return true
  }),
}))

vi.mock('../../libs/electron/location', () => ({
  baseUrl: vi.fn(() => 'http://localhost:5173'),
  getElectronMainDirname: vi.fn(() => '/tmp/airi-main'),
  load: vi.fn(async () => undefined),
  withHashRoute: vi.fn((_base: string, route: string) => route),
}))

vi.mock('../../libs/electron/persistence', () => ({
  createConfig: vi.fn(() => ({
    get: vi.fn(() => ({})),
    setup: vi.fn(),
    update: vi.fn(),
  })),
}))

vi.mock('../shared/window', () => ({
  protectPrivilegedWindowNavigation: vi.fn(),
  setWindowAlwaysOnTop: vi.fn(),
  spotlightLikeWindowConfig: vi.fn(() => ({})),
  transparentWindowConfig: vi.fn(() => ({})),
}))

vi.mock('./rpc/index.electron', () => ({
  setupWidgetsWindowInvokes: vi.fn(async () => vi.fn()),
}))

function createManager() {
  return setupWidgetsWindowManager({
    i18n: {} as never,
    serverChannel: {} as never,
  })
}

describe('widget window lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mocks.reset()
  })

  it('destroys the widget window when its TTL expires', async () => {
    // ROOT CAUSE:
    //
    // The TTL removed only the widget record. The reusable BrowserWindow stayed open.
    // The renderer then displayed a waiting state for a widget that no longer existed.
    //
    // We fixed this by making one manager operation destroy the record and its window.
    const manager = createManager()
    const id = await manager.pushWidget({
      componentName: 'weather',
      ttlMs: 1000,
    })
    const window = mocks.windows[0]

    await vi.advanceTimersByTimeAsync(1000)

    expect(manager.getWidgetSnapshot(id)).toBeUndefined()
    expect(window.close).toHaveBeenCalledOnce()
  })

  it('does not restart the TTL for a content-only update', async () => {
    // ROOT CAUSE:
    //
    // Each update cleared and recreated the timer, even when the update omitted ttlMs.
    // Frequent content updates could keep a widget alive after its original expiry time.
    //
    // We fixed this by changing the timer only when an update includes ttlMs.
    const manager = createManager()
    const id = await manager.pushWidget({
      componentName: 'weather',
      ttlMs: 1000,
    })

    await vi.advanceTimersByTimeAsync(600)
    await manager.updateWidget({ id, componentProps: { temperature: '20°C' } })
    await vi.advanceTimersByTimeAsync(400)

    expect(manager.getWidgetSnapshot(id)).toBeUndefined()
    expect(mocks.windows[0].close).toHaveBeenCalledOnce()
  })

  it('keeps widget instances and their windows isolated', async () => {
    // ROOT CAUSE:
    //
    // All widget ids resolved to one reusable BrowserWindow.
    // An expired record could not destroy its window without also closing another widget.
    //
    // We fixed this by assigning one window context to each generated widget id.
    const manager = createManager()
    const firstId = await manager.pushWidget({ componentName: 'weather', ttlMs: 1000 })
    const secondId = await manager.pushWidget({ componentName: 'weather', ttlMs: 2000 })

    expect(firstId).not.toBe(secondId)
    expect(mocks.windows).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(1000)

    expect(mocks.windows[0].close).toHaveBeenCalledOnce()
    expect(mocks.windows[1].close).not.toHaveBeenCalled()
    expect(manager.getWidgetSnapshot(firstId)).toBeUndefined()
    expect(manager.getWidgetSnapshot(secondId)).toBeDefined()
  })

  it('removes the widget record when the user closes its window', async () => {
    const manager = createManager()
    const id = await manager.pushWidget({ componentName: 'weather' })

    mocks.windows[0].close()

    expect(manager.getWidgetSnapshot(id)).toBeUndefined()
  })
})
