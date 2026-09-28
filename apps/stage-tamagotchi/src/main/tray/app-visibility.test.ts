import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { excludeWindowFromTaskbar } from '../windows/shared/taskbar'
import { TrayAppVisibility } from './app-visibility'

const electron = vi.hoisted(() => ({
  dock: { hide: vi.fn(), show: vi.fn(async () => {}) },
  getAllWindows: vi.fn(),
}))
const platform = vi.hoisted(() => ({ isWindows: false }))

vi.mock('std-env', () => platform)
vi.mock('electron', () => ({
  app: Object.assign(new EventEmitter(), { dock: electron.dock }),
  BrowserWindow: { getAllWindows: electron.getAllWindows },
}))

describe('tray app visibility', () => {
  let visibility: TrayAppVisibility | undefined

  afterEach(() => {
    visibility?.dispose()
    visibility = undefined
    vi.clearAllMocks()
    platform.isWindows = false
  })

  it('hides the macOS Dock icon without hiding application windows', () => {
    visibility = new TrayAppVisibility(true)

    expect(electron.dock.hide).toHaveBeenCalledOnce()
    expect(electron.getAllWindows).not.toHaveBeenCalled()
  })

  it('skips existing and future Windows taskbar entries until shutdown', async () => {
    const { app } = await import('electron')
    platform.isWindows = true
    const mainWindow = { setSkipTaskbar: vi.fn() }
    const settingsWindow = { setSkipTaskbar: vi.fn() }
    electron.getAllWindows.mockReturnValue([mainWindow, settingsWindow])
    visibility = new TrayAppVisibility(true)

    expect(mainWindow.setSkipTaskbar).toHaveBeenCalledWith(true)
    expect(settingsWindow.setSkipTaskbar).toHaveBeenCalledWith(true)

    const chatWindow = { setSkipTaskbar: vi.fn() }
    app.emit('browser-window-created', {}, chatWindow)
    expect(chatWindow.setSkipTaskbar).toHaveBeenCalledWith(true)

    visibility.dispose()
    const laterWindow = { setSkipTaskbar: vi.fn() }
    app.emit('browser-window-created', {}, laterWindow)
    expect(laterWindow.setSkipTaskbar).not.toHaveBeenCalled()
  })

  it('leaves icons unchanged until the user enables hiding', async () => {
    visibility = new TrayAppVisibility()
    expect(electron.dock.hide).not.toHaveBeenCalled()
    expect(electron.dock.show).not.toHaveBeenCalled()

    await visibility.setHidden(true)
    expect(electron.dock.hide).toHaveBeenCalledOnce()
    await visibility.setHidden(false)
    expect(electron.dock.show).toHaveBeenCalledOnce()
  })

  it('restores ordinary Windows entries without exposing utility windows', async () => {
    const { app } = await import('electron')
    platform.isWindows = true
    const mainWindow = { setSkipTaskbar: vi.fn(), isFocusable: () => true }
    const spotlight = { setSkipTaskbar: vi.fn(), isFocusable: () => true }
    const overlay = { setSkipTaskbar: vi.fn(), isFocusable: () => false }
    excludeWindowFromTaskbar(spotlight)
    electron.getAllWindows.mockReturnValue([mainWindow, spotlight, overlay])
    visibility = new TrayAppVisibility()
    expect(mainWindow.setSkipTaskbar).not.toHaveBeenCalled()

    await visibility.setHidden(true)
    expect(mainWindow.setSkipTaskbar).toHaveBeenLastCalledWith(true)
    await visibility.setHidden(false)
    expect(mainWindow.setSkipTaskbar).toHaveBeenLastCalledWith(false)
    expect(spotlight.setSkipTaskbar).toHaveBeenLastCalledWith(true)
    expect(overlay.setSkipTaskbar).toHaveBeenLastCalledWith(true)

    const laterWindow = { setSkipTaskbar: vi.fn() }
    app.emit('browser-window-created', {}, laterWindow)
    expect(laterWindow.setSkipTaskbar).not.toHaveBeenCalled()
  })
})
