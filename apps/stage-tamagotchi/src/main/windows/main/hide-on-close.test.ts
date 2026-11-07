import type { BrowserWindow } from 'electron'

import { EventEmitter } from 'node:events'

import { autoUpdater } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emitAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { hideOnClose } from './hide-on-close'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return { autoUpdater: new EventEmitter() }
})

function createWindow() {
  const window = Object.assign(new EventEmitter(), { hide: vi.fn() })
  const browserWindow: BrowserWindow = window as never
  hideOnClose(browserWindow)

  return {
    window,
    /** Emits `close` as Electron does, and returns whether a listener cancelled it. */
    close() {
      const event = { preventDefault: vi.fn() }
      window.emit('close', event)
      return event.preventDefault.mock.calls.length > 0
    },
  }
}

describe('hideOnClose', () => {
  beforeEach(() => {
    autoUpdater.removeAllListeners()
  })

  it('hides the window instead of closing it while the app runs', () => {
    const { window, close } = createWindow()

    expect(close()).toBe(true)
    expect(window.hide).toHaveBeenCalledTimes(1)
    window.emit('closed')
  })

  it('allows the close after the app starts to quit', async () => {
    const { window, close } = createWindow()

    await emitAppBeforeQuit()

    expect(close()).toBe(false)
    expect(window.hide).not.toHaveBeenCalled()
    window.emit('closed')
  })

  // ROOT CAUSE:
  //
  // On macOS, "Restart to install" did not quit the app. `quitAndInstall` closes the windows before `before-quit`,
  // and the main window cancelled that close.
  //
  // We fixed this by also allowing the close on `before-quit-for-update`.
  it('allows the close when the app quits to install an update', () => {
    const { window, close } = createWindow()

    autoUpdater.emit('before-quit-for-update')

    expect(close()).toBe(false)
    expect(window.hide).not.toHaveBeenCalled()
    window.emit('closed')
  })

  it('removes its quit listeners when the window closes', () => {
    const { window } = createWindow()

    window.emit('closed')

    expect(autoUpdater.listenerCount('before-quit-for-update')).toBe(0)
  })
})
