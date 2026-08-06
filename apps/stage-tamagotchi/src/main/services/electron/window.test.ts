import { beforeEach, describe, expect, it, vi } from 'vitest'

import { electron } from '../../../shared/eventa'
import { createWindowService } from './window'

interface InvokeOptions {
  raw: {
    ipcMainEvent: {
      sender: {
        id: number
      }
    }
  }
}

type InvokeHandler = (payload: unknown, options: InvokeOptions) => unknown

const invokeHandlers = vi.hoisted(() => new Map<unknown, InvokeHandler>())
const stdEnvState = vi.hoisted(() => ({ isWindows: false }))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const original = await importOriginal<typeof import('@moeru/eventa')>()

  return {
    ...original,
    defineInvokeHandler: vi.fn((_context: unknown, event: unknown, handler: InvokeHandler) => {
      invokeHandlers.set(event, handler)
    }),
  }
})

vi.mock('@proj-airi/electron-vueuse/main', () => ({
  createRendererLoop: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  safeClose: vi.fn(),
}))

vi.mock('std-env', () => ({
  get isWindows() {
    return stdEnvState.isWindows
  },
}))

vi.mock('../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: vi.fn(),
  onAppWindowAllClosed: vi.fn(),
}))

vi.mock('../../windows/shared/window', () => ({
  resizeWindowByDelta: vi.fn(),
}))

function createWindowMock() {
  return {
    blur: vi.fn(),
    focus: vi.fn(),
    getBounds: vi.fn(),
    hide: vi.fn(),
    isFocused: vi.fn(),
    isMinimized: vi.fn(),
    isVisible: vi.fn(),
    on: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setBackgroundMaterial: vi.fn(),
    setBounds: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setVibrancy: vi.fn(),
    show: vi.fn(),
    webContents: {
      id: 7,
    },
  }
}

function invokeSetBackgroundMaterial(material: 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed') {
  const handler = invokeHandlers.get(electron.window.setBackgroundMaterial)

  expect(handler).toBeTypeOf('function')

  handler?.([material], {
    raw: {
      ipcMainEvent: {
        sender: {
          id: 7,
        },
      },
    },
  })
}

describe('createWindowService', () => {
  beforeEach(() => {
    invokeHandlers.clear()
    stdEnvState.isWindows = false
    vi.clearAllMocks()
  })

  it('ignores background material changes outside Windows', () => {
    // ROOT CAUSE:
    //
    // Electron documents background materials as a Windows-only feature.
    // Its runtime setter still changes the BrowserWindow background color on macOS.
    //
    // Before the fix, the shared service called the setter on every platform.
    // We fixed this by keeping the platform guard at the Electron service boundary.
    const window = createWindowMock()

    createWindowService({ context: { emit: vi.fn() } as never, window: window as never })
    invokeSetBackgroundMaterial('none')

    expect(window.setBackgroundMaterial).not.toHaveBeenCalled()
  })

  it('sets the background material on Windows for the source window', () => {
    stdEnvState.isWindows = true
    const window = createWindowMock()

    createWindowService({ context: { emit: vi.fn() } as never, window: window as never })
    invokeSetBackgroundMaterial('acrylic')

    expect(window.setBackgroundMaterial).toHaveBeenCalledWith('acrylic')
  })
})
