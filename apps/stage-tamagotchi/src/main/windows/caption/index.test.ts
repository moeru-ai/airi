import { beforeEach, describe, expect, it, vi } from 'vitest'

const setupBaseWindowElectronInvokes = vi.hoisted(() => vi.fn(async () => {}))

function createEmitter() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const eventHandlers = handlers.get(event) ?? []
      eventHandlers.push(handler)
      handlers.set(event, eventHandlers)
    }),
  }
}

async function setupCaptionManager() {
  const windowEvents = createEmitter()
  const window = {
    ...windowEvents,
    focus: vi.fn(),
    getBounds: vi.fn(() => ({ x: 120, y: 120, width: 480, height: 180 })),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setBounds: vi.fn(),
    setFullScreenable: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setPosition: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setWindowButtonVisibility: vi.fn(),
    show: vi.fn(),
    webContents: {},
  }
  const context = { emit: vi.fn() }
  const config = { isFollowing: true, matrices: {} }

  vi.doMock('electron', () => ({
    BrowserWindow: class MockBrowserWindow {
      constructor() {
        return window
      }
    },
    ipcMain: { setMaxListeners: vi.fn() },
    screen: {
      getAllDisplays: vi.fn(() => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }]),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
    },
  }))
  vi.doMock('@moeru/eventa', () => ({
    defineInvokeHandler: vi.fn(() => vi.fn()),
  }))
  vi.doMock('@moeru/eventa/adapters/electron/main', () => ({
    createContext: vi.fn(() => ({ context })),
  }))
  vi.doMock('animejs', () => ({
    animate: vi.fn(() => ({ pause: vi.fn() })),
    utils: { round: vi.fn(() => (value: number) => value) },
  }))
  vi.doMock('es-toolkit', () => ({
    debounce: vi.fn(() => vi.fn()),
    throttle: vi.fn((handler: () => void) => handler),
  }))
  vi.doMock('../../../shared/eventa', () => ({
    captionGetIsFollowingWindow: { sendEvent: { id: 'caption-get-is-following-send' } },
    captionIsFollowingWindowChanged: { id: 'caption-is-following-changed' },
  }))
  vi.doMock('../../libs/electron/location', () => ({
    baseUrl: vi.fn(() => new URL('file:///renderer/')),
    getElectronMainDirname: vi.fn(() => '/app/main'),
    load: vi.fn(async () => {}),
    withHashRoute: vi.fn((url: URL) => url),
  }))
  vi.doMock('../../libs/electron/persistence', () => ({
    createConfig: vi.fn(() => ({
      get: vi.fn(() => config),
      setup: vi.fn(),
      update: vi.fn(),
    })),
  }))
  vi.doMock('../../libs/electron/window-manager', () => ({
    createReusableWindow: vi.fn((factory: () => Promise<unknown>) => {
      let createdWindow: Promise<unknown> | undefined
      return {
        getWindow: () => {
          createdWindow ??= factory()
          return createdWindow
        },
      }
    }),
  }))
  vi.doMock('../shared/window', () => ({
    protectPrivilegedWindowNavigation: vi.fn(),
    setupBaseWindowElectronInvokes,
    transparentWindowConfig: vi.fn(() => ({})),
  }))

  const { setupCaptionWindowManager } = await import('./index')
  const manager = setupCaptionWindowManager({
    mainWindow: {
      getBounds: vi.fn(() => ({ x: 100, y: 100, width: 480, height: 640 })),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as never,
    serverChannel: {} as never,
    i18n: {} as never,
  })
  await manager.getWindow()

  return { context, window }
}

describe('caption window interactivity', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('keeps main-process ownership of caption click-through state', async () => {
    // ROOT CAUSE:
    //
    // The caption enables click-through before its initial navigation completes.
    // Managed navigation recovery then restores mouse input and makes the caption intercept clicks.
    // The fix must exclude this main-process-owned window from renderer interactivity recovery.
    const { context, window } = await setupCaptionManager()

    expect(setupBaseWindowElectronInvokes).toHaveBeenCalledWith({
      context,
      window,
      serverChannel: {},
      i18n: {},
      manageWindowInteractivity: false,
    })
  })
})
