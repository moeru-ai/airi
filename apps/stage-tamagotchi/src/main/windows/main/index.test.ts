import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupMainWindow } from './index'

const mocks = vi.hoisted(() => {
  const updateConfig = vi.fn()
  const actualBounds = { x: 0, y: 0, width: 450, height: 600 }
  const commandLineSwitches = new Map<string, string>()

  class FakeBrowserWindow {
    webContents = { openDevTools: vi.fn() }

    getBounds = vi.fn(() => actualBounds)
    hide = vi.fn()
    on = vi.fn()
    setFullScreenable = vi.fn()
    setVisibleOnAllWorkspaces = vi.fn()
    setWindowButtonVisibility = vi.fn()
    show = vi.fn()
  }

  return { actualBounds, commandLineSwitches, FakeBrowserWindow, updateConfig }
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
    get: vi.fn(() => ({
      windows: [{ title: 'AIRI', tag: 'main', x: 120, y: 80, width: 450, height: 600 }],
    })),
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
    mocks.commandLineSwitches.clear()
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
})
