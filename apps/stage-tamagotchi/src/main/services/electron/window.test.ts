import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronGetWindowControlsState,
  electronWindowControlsStateChanged,
  electronWindowMinimize,
  electronWindowToggleMaximize,
} from '../../../shared/eventa'
import { createWindowService } from './window'

const mocks = vi.hoisted(() => ({
  handlers: new Map<unknown, (payload: unknown, options: unknown) => unknown>(),
  platform: { isMacOS: false },
}))

// NOTICE:
// The handlers read the sender of the Electron IPC event, and a plain eventa context carries no such event.
// The double keeps each handler, so the test can call it as a chosen sender.
// Removal condition: eventa can supply raw IPC options to a handler in a test.
vi.mock('@moeru/eventa', async (importOriginal) => {
  return {
    ...await importOriginal<typeof import('@moeru/eventa')>(),
    defineInvokeHandler: (_context: unknown, event: unknown, handler: (payload: unknown, options: unknown) => unknown) => {
      mocks.handlers.set(event, handler)
    },
  }
})

vi.mock('@proj-airi/electron-vueuse/main', () => ({
  createRendererLoop: () => ({ start: vi.fn(), stop: vi.fn() }),
  safeClose: vi.fn(),
}))

vi.mock('std-env', () => ({
  get isMacOS() { return mocks.platform.isMacOS },
  isWindows: false,
}))

vi.mock('../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: () => () => {},
  onAppWindowAllClosed: () => () => {},
}))

vi.mock('../../windows/shared/window', () => ({
  resizeWindowByDelta: vi.fn(),
  setWindowAlwaysOnTop: vi.fn(),
}))

const ownSender = { raw: { ipcMainEvent: { sender: { id: 7 } } } }
const otherSender = { raw: { ipcMainEvent: { sender: { id: 8 } } } }

class FakeWindow extends EventEmitter {
  readonly webContents = { id: 7 }
  maximized = false
  fullscreen = false
  minimize = vi.fn()
  maximize = vi.fn()
  unmaximize = vi.fn()
  isFullScreen = () => this.fullscreen
  isMaximized = () => this.maximized
  isMinimizable = () => false
  isMaximizable = () => true
  isClosable = () => true
}

function setupService() {
  const window = new FakeWindow()
  const emit = vi.fn()
  createWindowService({ context: { emit } as never, window: window as never })
  return { emit, window }
}

function invoke(event: unknown, sender: unknown = ownSender) {
  return mocks.handlers.get(event)!(undefined, sender)
}

describe('window controls', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.platform.isMacOS = false
  })

  it('reports the buttons that the window allows', () => {
    setupService()

    expect(invoke(electronGetWindowControlsState)).toEqual({
      systemControls: false,
      fullscreen: false,
      maximized: false,
      minimizable: false,
      maximizable: true,
      closable: true,
    })
  })

  it('reports system controls on macOS', () => {
    mocks.platform.isMacOS = true
    setupService()

    expect(invoke(electronGetWindowControlsState)).toMatchObject({ systemControls: true })
  })

  it('maximizes a normal window and restores a maximized window', () => {
    const { window } = setupService()

    invoke(electronWindowToggleMaximize)
    expect(window.maximize).toHaveBeenCalledTimes(1)
    expect(window.unmaximize).not.toHaveBeenCalled()

    window.maximized = true
    invoke(electronWindowToggleMaximize)
    expect(window.unmaximize).toHaveBeenCalledTimes(1)
    expect(window.maximize).toHaveBeenCalledTimes(1)
  })

  it('ignores requests from another window', () => {
    const { window } = setupService()

    invoke(electronWindowMinimize, otherSender)
    invoke(electronWindowToggleMaximize, otherSender)

    expect(window.minimize).not.toHaveBeenCalled()
    expect(window.maximize).not.toHaveBeenCalled()
    expect(invoke(electronGetWindowControlsState, otherSender)).toBeUndefined()
  })

  it.each([
    ['maximize', { maximized: true }],
    ['unmaximize', { maximized: false }],
    ['enter-full-screen', { fullscreen: true }],
    ['leave-full-screen', { fullscreen: false }],
  ])('sends the new state when the window fires %s', (eventName, expected) => {
    const { emit, window } = setupService()
    Object.assign(window, expected)

    window.emit(eventName)

    expect(emit).toHaveBeenCalledWith(electronWindowControlsStateChanged, expect.objectContaining(expected))
  })
})
