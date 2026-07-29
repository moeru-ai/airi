import type { BrowserWindow, KeyboardEvent, MenuItem, MenuItemConstructorOptions } from 'electron'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupTray } from '.'

const mocks = vi.hoisted(() => ({
  menuTemplates: [] as MenuItemConstructorOptions[][],
  onAppBeforeQuit: vi.fn(),
}))

vi.mock('electron', () => {
  const trayImage = {
    resize: vi.fn(),
    setTemplateImage: vi.fn(),
  }
  trayImage.resize.mockReturnValue(trayImage)

  return {
    app: {
      quit: vi.fn(),
    },
    Menu: {
      buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => {
        mocks.menuTemplates.push(template)
        return {}
      }),
    },
    nativeImage: {
      createFromPath: vi.fn(() => trayImage),
    },
    screen: {
      getAllDisplays: vi.fn(() => [{ bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 0, width: 1440, height: 875 } }]),
      getDisplayMatching: vi.fn(() => ({ bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 0, width: 1440, height: 875 } })),
      getPrimaryDisplay: vi.fn(() => ({ bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 0, width: 1440, height: 875 } })),
    },
    Tray: class {
      addListener = vi.fn()
      destroy = vi.fn()
      setContextMenu = vi.fn()
      setToolTip = vi.fn()
    },
  }
})

vi.mock('alien-signals', () => ({
  effect: (callback: () => void) => callback(),
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: false,
  },
}))

vi.mock('@proj-airi/electron-vueuse/main', () => ({
  isRendererUnavailable: vi.fn(() => false),
}))

vi.mock('../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: mocks.onAppBeforeQuit,
}))

vi.mock('../windows/inlay', () => ({
  setupInlayWindow: vi.fn(),
}))

vi.mock('../windows/shared/display', () => ({
  computeResizedBoundsAnchoredToDominantDisplay: vi.fn(),
  findDominantDisplayArea: vi.fn(() => ({ bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 0, width: 1440, height: 875 } })),
}))

vi.mock('../windows/shared/window', () => ({
  toggleWindowShow: vi.fn(),
}))

describe('setupTray', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.menuTemplates.length = 0
  })

  it('reloads the main renderer from the tray without quitting the app', () => {
    const reload = vi.fn()
    const mainWindow = {
      center: vi.fn(),
      getBounds: vi.fn(() => ({ x: 100, y: 100, width: 450, height: 600 })),
      on: vi.fn(),
      setBounds: vi.fn(),
      setPosition: vi.fn(),
      setResizable: vi.fn(),
      show: vi.fn(),
      webContents: {
        reload,
      },
    }

    // NOTICE:
    // The tray boundary requires Electron's concrete BrowserWindow and window-manager types.
    // This test supplies only the methods setupTray exercises so it can verify the real menu wiring.
    // Source/context: apps/stage-tamagotchi/src/main/tray/index.ts.
    // Removal condition: setupTray accepts explicit narrow collaborator contracts.
    setupTray({
      mainWindow: mainWindow as unknown as BrowserWindow,
      settingsWindow: { openWindow: vi.fn() } as never,
      captionWindow: {
        getIsFollowingWindow: vi.fn(() => false),
        isVisible: vi.fn(() => false),
        onVisibilityChanged: vi.fn(),
        resetToSide: vi.fn(),
        setFollowWindow: vi.fn(),
        toggleVisibility: vi.fn(),
      } as never,
      widgetsWindow: { getWindow: vi.fn() } as never,
      beatSyncBgWindow: { webContents: { openDevTools: vi.fn() } } as never,
      aboutWindow: vi.fn(),
      serverChannel: {} as never,
      i18n: {
        locale: vi.fn(() => 'en'),
        t: vi.fn((key: string) => key),
      } as never,
    })

    vi.runAllTimers()

    // ROOT CAUSE:
    //
    // The tray menu exposed Quit but no way to recover a stale renderer while
    // keeping the Electron main process and its background services alive.
    //
    // We fix this by wiring a dedicated menu item to WebContents.reload().
    const contextMenuTemplate = mocks.menuTemplates.at(-1)
    const reloadItem = contextMenuTemplate?.find(item => item.label === 'tamagotchi.electron.tray.menu.labels.label.reload')

    expect(reloadItem).toBeDefined()

    reloadItem?.click?.(
      {} as MenuItem,
      mainWindow as unknown as BrowserWindow,
      {} as KeyboardEvent,
    )

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
