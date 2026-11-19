import type { InferOutput } from 'valibot'

import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'

import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppIconVisibility, excludeWindowFromTaskbar, showWindowOnAllWorkspaces } from './app-icon'

const electron = vi.hoisted(() => ({
  dock: { hide: vi.fn(), show: vi.fn(async () => {}), isVisible: vi.fn() },
  getAllWindows: vi.fn(),
}))
const platform = vi.hoisted(() => ({ isWindows: false }))

vi.mock('std-env', () => platform)
vi.mock('electron', () => ({
  app: Object.assign(new EventEmitter(), { dock: electron.dock }),
  BrowserWindow: { getAllWindows: electron.getAllWindows },
}))

function createAppConfig(initial?: InferOutput<typeof globalAppConfigSchema>): Config<typeof globalAppConfigSchema> {
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
  afterEach(async () => {
    const { app } = await import('electron')
    app.removeAllListeners()
    vi.clearAllMocks()
    platform.isWindows = false
  })

  it('hides the macOS Dock icon at startup when the saved preference is enabled', () => {
    const visibility = new AppIconVisibility(createAppConfig({ hideAppIcon: true }))

    expect(visibility.hidden).toBe(true)
    expect(electron.dock.hide).toHaveBeenCalledOnce()
  })

  it('leaves icons unchanged until the user enables hiding, and keeps other app config fields', async () => {
    const config = createAppConfig({ language: 'en' })
    const visibility = new AppIconVisibility(config)
    expect(electron.dock.hide).not.toHaveBeenCalled()

    await visibility.setHidden(true)
    expect(electron.dock.hide).toHaveBeenCalledOnce()
    expect(config.get()).toEqual({ language: 'en', hideAppIcon: true })

    await visibility.setHidden(false)
    expect(electron.dock.show).toHaveBeenCalledOnce()
    expect(config.get()).toEqual({ language: 'en', hideAppIcon: false })
  })

  it('skips current and later Windows taskbar entries, then restores only ordinary windows', async () => {
    const { app } = await import('electron')
    platform.isWindows = true
    const mainWindow = createWindow()
    const spotlight = createWindow()
    const overlay = createWindow(false)
    excludeWindowFromTaskbar(spotlight)
    electron.getAllWindows.mockReturnValue([mainWindow, spotlight, overlay])
    const visibility = new AppIconVisibility(createAppConfig())
    expect(mainWindow.setSkipTaskbar).not.toHaveBeenCalled()

    await visibility.setHidden(true)
    expect(mainWindow.setSkipTaskbar).toHaveBeenLastCalledWith(true)
    const chatWindow = createWindow()
    app.emit('browser-window-created', {}, chatWindow)
    expect(chatWindow.setSkipTaskbar).toHaveBeenCalledWith(true)

    await visibility.setHidden(false)
    expect(mainWindow.setSkipTaskbar).toHaveBeenLastCalledWith(false)
    expect(spotlight.setSkipTaskbar).toHaveBeenLastCalledWith(true)
    expect(overlay.setSkipTaskbar).toHaveBeenLastCalledWith(true)
    const laterWindow = createWindow()
    app.emit('browser-window-created', {}, laterWindow)
    expect(laterWindow.setSkipTaskbar).not.toHaveBeenCalled()
  })

  // https://github.com/electron/electron/issues/10078
  //
  // ROOT CAUSE:
  // Calling setVisibleOnAllWorkspaces without skipTransformProcessType causes macOS to
  // transform the process type and restore the Dock icon even when the user hid it.
  // We skip the transform when the Dock is already hidden.
  it.each([true, false])('skips the macOS process change only when the Dock is hidden (visible: %s) (Issue #10078)', (visible) => {
    electron.dock.isVisible.mockReturnValue(visible)
    const window = { setVisibleOnAllWorkspaces: vi.fn() }

    showWindowOnAllWorkspaces(window)

    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { skipTransformProcessType: !visible })
  })

  // https://github.com/electron/electron/issues/10078
  //
  // ROOT CAUSE:
  // When the user has opted to hide the app icon, passing hideAppIcon: true forces
  // skipTransformProcessType regardless of dock visibility to prevent the Dock from reappearing.
  it('skips the macOS process change when hideAppIcon preference is enabled even if dock is visible (Issue #10078)', () => {
    electron.dock.isVisible.mockReturnValue(true)
    const window = { setVisibleOnAllWorkspaces: vi.fn() }

    showWindowOnAllWorkspaces(window, { hideAppIcon: true })

    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { skipTransformProcessType: true })
  })

  // https://github.com/electron/electron/issues/10078
  //
  // ROOT CAUSE:
  // visibleOnFullScreen must be forwarded alongside skipTransformProcessType so
  // the window stays visible on all workspaces when a fullscreen app is in focus.
  it('passes visibleOnFullScreen option when specified (Issue #10078)', () => {
    electron.dock.isVisible.mockReturnValue(true)
    const window = { setVisibleOnAllWorkspaces: vi.fn() }

    showWindowOnAllWorkspaces(window, { visibleOnFullScreen: true, hideAppIcon: true })

    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    })
  })
})
