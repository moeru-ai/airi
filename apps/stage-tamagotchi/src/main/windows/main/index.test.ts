import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupMainWindow } from './index'

const mocks = vi.hoisted(() => {
  const updateConfig = vi.fn()
  const getConfig = vi.fn()
  const actualBounds = { x: 0, y: 0, width: 450, height: 600 }
  const commandLineSwitches = new Map<string, string>()
  const windowEventHandlers = new Map<string, () => void>()

  class FakeBrowserWindow {
    webContents = { openDevTools: vi.fn() }

    getBounds = vi.fn(() => actualBounds)
    hide = vi.fn()
    on = vi.fn((event: string, handler: () => void) => {
      windowEventHandlers.set(event, handler)
      return this
    })

    setFullScreenable = vi.fn()
    setVisibleOnAllWorkspaces = vi.fn()
    setWindowButtonVisibility = vi.fn()
    show = vi.fn()
  }

  return { actualBounds, commandLineSwitches, FakeBrowserWindow, getConfig, updateConfig, windowEventHandlers }
})

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('@moeru/eventa', () => ({ defineInvokeHandler: vi.fn() }))
vi.mock('@moeru/eventa/adapters/electron/main', () => ({ createContext: vi.fn() }))
vi.mock('@proj-airi/electron-screen-capture/main', () => ({ initScreenCaptureForWindow: vi.fn() }))
vi.mock('electron', () => ({
  app: {
    commandLine: {
      getSwitchValue: vi.fn((name: string) => mocks.commandLineSwitches.get(name) ?? ''),
    },
  },
  BrowserWindow: mocks.FakeBrowserWindow,
  ipcMain: { setMaxListeners: vi.fn() },
  screen: {
    getAllDisplays: vi.fn(() => [{ bounds: mocks.actualBounds, workArea: mocks.actualBounds }]),
    getDisplayMatching: vi.fn(() => ({ workArea: mocks.actualBounds })),
    getPrimaryDisplay: vi.fn(() => ({ workArea: mocks.actualBounds })),
  },
}))
vi.mock('std-env', () => ({ isLinux: true, isMacOS: false }))

vi.mock('../../../shared/eventa', () => ({ electronStartDraggingWindow: {} }))
vi.mock('../../libs/bootkit/lifecycle', () => ({ onAppBeforeQuit: vi.fn() }))
vi.mock('../../libs/electron/location', () => ({
  baseUrl: vi.fn(() => 'http://localhost'),
  getElectronMainDirname: vi.fn(() => '/tmp'),
  load: vi.fn(),
  withHashRoute: vi.fn(url => url),
}))
vi.mock('../../libs/electron/persistence', () => ({
  createConfig: vi.fn(() => ({
    setup: vi.fn(),
    get: mocks.getConfig,
    update: mocks.updateConfig,
  })),
}))
vi.mock('../shared', () => ({
  protectPrivilegedWindowNavigation: vi.fn(),
  setWindowAlwaysOnTop: vi.fn(),
  transparentWindowConfig: vi.fn(() => ({})),
}))
vi.mock('./rpc/index.electron', () => ({ setupMainWindowElectronInvokes: vi.fn() }))

type SetupMainWindowParams = Parameters<typeof setupMainWindow>[0]

function createSetupMainWindowParams(): SetupMainWindowParams {
  return {
    editorWindow: {} as SetupMainWindowParams['editorWindow'],
    settingsWindow: {} as SetupMainWindowParams['settingsWindow'],
    chatWindow: vi.fn() as SetupMainWindowParams['chatWindow'],
    widgetsManager: {} as SetupMainWindowParams['widgetsManager'],
    noticeWindow: {} as SetupMainWindowParams['noticeWindow'],
    autoUpdater: {} as SetupMainWindowParams['autoUpdater'],
    serverChannel: {} as SetupMainWindowParams['serverChannel'],
    godotStageManager: {} as SetupMainWindowParams['godotStageManager'],
    mcpStdioManager: {} as SetupMainWindowParams['mcpStdioManager'],
    i18n: {} as SetupMainWindowParams['i18n'],
    onboardingWindowManager: {} as SetupMainWindowParams['onboardingWindowManager'],
  }
}

describe('setupMainWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      windows: [{ title: 'AIRI', tag: 'main', x: 120, y: 80, width: 450, height: 600 }],
    })
    mocks.commandLineSwitches.clear()
    mocks.windowEventHandlers.clear()
    Object.assign(mocks.actualBounds, { x: 0, y: 0, width: 450, height: 600 })
    vi.stubEnv('XDG_SESSION_TYPE', 'wayland')
  })

  // https://github.com/moeru-ai/airi/pull/2203#discussion_r3922007419
  it('does not overwrite saved bounds during startup on native Wayland', async () => {
    // ROOT CAUSE:
    //
    // Native Wayland ignores requested window coordinates, so Electron reports the compositor-selected position.
    // Persisting that position during startup destroys saved coordinates that remain valid under X11 or XWayland.
    //
    // We fixed this by keeping startup persistence disabled on native Wayland while preserving move and resize saves.
    await setupMainWindow(createSetupMainWindowParams())

    expect(mocks.updateConfig).not.toHaveBeenCalled()
  })

  it('persists startup bounds when XWayland is selected explicitly', async () => {
    mocks.commandLineSwitches.set('ozone-platform', 'x11')

    await setupMainWindow(createSetupMainWindowParams())

    expect(mocks.updateConfig).toHaveBeenCalledOnce()
  })

  // https://github.com/moeru-ai/airi/pull/2203#discussion_r3946151748
  it('preserves saved coordinates during native Wayland resize events for Issue #2181', async () => {
    // ROOT CAUSE:
    //
    // Electron reports compositor-owned x/y values on native Wayland even when only the window size changes.
    // Saving the complete bounds during resize erased coordinates that remained reusable under X11 or XWayland.
    //
    // We fixed this by persisting the new size while retaining the previously saved position on native Wayland.
    await setupMainWindow(createSetupMainWindowParams())
    Object.assign(mocks.actualBounds, { x: 0, y: 0, width: 640, height: 720 })

    mocks.windowEventHandlers.get('resize')?.()

    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      windows: [expect.objectContaining({ x: 120, y: 80, width: 640, height: 720 })],
    }))
  })
  // https://github.com/moeru-ai/airi/pull/2203#discussion_r3948519794
  it('preserves saved coordinates during native Wayland move events for Issue #2181', async () => {
    // ROOT CAUSE:
    // Wayland move events saved compositor coordinates over the reusable X11 position.
    // Both event handlers must preserve the saved position on native Wayland.
    await setupMainWindow(createSetupMainWindowParams())
    Object.assign(mocks.actualBounds, { x: 0, y: 0 })

    mocks.windowEventHandlers.get('move')?.()

    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      windows: [expect.objectContaining({ x: 120, y: 80 })],
    }))
  })

  // https://github.com/moeru-ai/airi/pull/2203#discussion_r3946256444
  it('omits coordinates for a new native Wayland profile for Issue #2181', async () => {
    // ROOT CAUSE:
    // The first save ignored the position policy and stored compositor coordinates.
    // A new profile must save the size without inventing a reusable position.
    mocks.getConfig.mockReturnValue({ windows: [] })
    await setupMainWindow(createSetupMainWindowParams())

    mocks.windowEventHandlers.get('resize')?.()

    expect(mocks.updateConfig).toHaveBeenCalledWith({
      windows: [{ title: 'AIRI', tag: 'main', width: 450, height: 600 }],
    })
  })

  it('saves coordinates during XWayland move events', async () => {
    mocks.commandLineSwitches.set('ozone-platform', 'x11')
    await setupMainWindow(createSetupMainWindowParams())
    mocks.updateConfig.mockClear()
    Object.assign(mocks.actualBounds, { x: 200, y: 300 })

    mocks.windowEventHandlers.get('move')?.()

    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      windows: [expect.objectContaining({ x: 200, y: 300 })],
    }))
  })
})
