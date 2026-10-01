import type { InferOutput } from 'valibot'

import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'

import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppIconVisibility, excludeWindowFromTaskbar, showWindowOnAllWorkspaces } from './app-icon'

type AppConfig = InferOutput<typeof globalAppConfigSchema>

const electron = vi.hoisted(() => ({
  dock: { hide: vi.fn(), show: vi.fn(async () => {}), isVisible: vi.fn() },
  getAllWindows: vi.fn(),
}))
const platform = vi.hoisted(() => ({ isMacOS: false, isWindows: false }))

vi.mock('std-env', () => platform)
vi.mock('electron', () => ({
  app: Object.assign(new EventEmitter(), { dock: electron.dock }),
  BrowserWindow: { getAllWindows: electron.getAllWindows },
}))

function createAppConfig(initial?: AppConfig): Config<typeof globalAppConfigSchema> {
  let value = initial
  return {
    setup: () => ({ status: 'ok', path: '', value }),
    get: () => value,
    update: (next) => { value = next },
    getDiagnostics: () => undefined,
  }
}

function createWindow(focusable = true) {
  return { setSkipTaskbar: vi.fn(), isFocusable: () => focusable }
}

describe('app icon visibility', () => {
  let visibility: AppIconVisibility | undefined

  afterEach(() => {
    visibility?.dispose()
    visibility = undefined
    vi.clearAllMocks()
    platform.isMacOS = false
    platform.isWindows = false
  })

  it('hides the macOS Dock icon without hiding application windows', () => {
    visibility = new AppIconVisibility(createAppConfig({ hideAppIcon: true }))

    expect(electron.dock.hide).toHaveBeenCalledOnce()
    expect(electron.getAllWindows).not.toHaveBeenCalled()
  })

  it('skips existing and future Windows taskbar entries until shutdown', async () => {
    const { app } = await import('electron')
    platform.isWindows = true
    const mainWindow = createWindow()
    const settingsWindow = createWindow()
    electron.getAllWindows.mockReturnValue([mainWindow, settingsWindow])
    visibility = new AppIconVisibility(createAppConfig({ hideAppIcon: true }))

    expect(mainWindow.setSkipTaskbar).toHaveBeenCalledWith(true)
    expect(settingsWindow.setSkipTaskbar).toHaveBeenCalledWith(true)

    const chatWindow = createWindow()
    app.emit('browser-window-created', {}, chatWindow)
    expect(chatWindow.setSkipTaskbar).toHaveBeenCalledWith(true)

    visibility.dispose()
    const laterWindow = createWindow()
    app.emit('browser-window-created', {}, laterWindow)
    expect(laterWindow.setSkipTaskbar).not.toHaveBeenCalled()
  })

  it('leaves icons unchanged until the user enables hiding', async () => {
    const config = createAppConfig({ language: 'en' })
    visibility = new AppIconVisibility(config)
    expect(electron.dock.hide).not.toHaveBeenCalled()
    expect(electron.dock.show).not.toHaveBeenCalled()

    await visibility.setHidden(true)
    expect(electron.dock.hide).toHaveBeenCalledOnce()
    expect(config.get()).toEqual({ language: 'en', hideAppIcon: true })

    await visibility.setHidden(false)
    expect(electron.dock.show).toHaveBeenCalledOnce()
    expect(config.get()).toEqual({ language: 'en', hideAppIcon: false })
  })

  it('restores ordinary Windows entries without exposing utility windows', async () => {
    const { app } = await import('electron')
    platform.isWindows = true
    const mainWindow = createWindow()
    const spotlight = createWindow()
    const overlay = createWindow(false)
    excludeWindowFromTaskbar(spotlight)
    electron.getAllWindows.mockReturnValue([mainWindow, spotlight, overlay])
    visibility = new AppIconVisibility(createAppConfig())
    expect(mainWindow.setSkipTaskbar).not.toHaveBeenCalled()

    await visibility.setHidden(true)
    expect(mainWindow.setSkipTaskbar).toHaveBeenLastCalledWith(true)

    await visibility.setHidden(false)
    expect(mainWindow.setSkipTaskbar).toHaveBeenLastCalledWith(false)
    expect(spotlight.setSkipTaskbar).toHaveBeenLastCalledWith(true)
    expect(overlay.setSkipTaskbar).toHaveBeenLastCalledWith(true)

    const laterWindow = createWindow()
    app.emit('browser-window-created', {}, laterWindow)
    expect(laterWindow.setSkipTaskbar).not.toHaveBeenCalled()
  })
})

describe('workspace visibility', () => {
  it.each([true, false])('preserves Dock visibility when isVisible returns %s', (visible) => {
    platform.isMacOS = true
    electron.dock.isVisible.mockReturnValue(visible)
    const window = { setVisibleOnAllWorkspaces: vi.fn() }

    showWindowOnAllWorkspaces(window, { visibleOnFullScreen: true })

    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: !visible,
    })
  })

  it('does not query the Dock on other platforms', () => {
    platform.isMacOS = false
    electron.dock.isVisible.mockClear()
    const window = { setVisibleOnAllWorkspaces: vi.fn() }

    showWindowOnAllWorkspaces(window)

    expect(electron.dock.isVisible).not.toHaveBeenCalled()
    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { skipTransformProcessType: false })
  })
})
