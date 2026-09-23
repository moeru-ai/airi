import { describe, expect, it, vi } from 'vitest'

import { setWindowAlwaysOnTop } from './window'

const mocks = vi.hoisted(() => ({
  isMacOS: false,
  isWindows: false,
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}))

vi.mock('std-env', () => ({
  get isMacOS() {
    return mocks.isMacOS
  },
  get isWindows() {
    return mocks.isWindows
  },
}))

vi.mock('../../services/electron', () => ({
  createAppService: vi.fn(),
  createPowerMonitorService: vi.fn(),
  createScreenService: vi.fn(),
  createSystemPreferencesService: vi.fn(),
  createWindowService: vi.fn(),
}))

describe('setWindowAlwaysOnTop', () => {
  it('disables always-on-top when flag is false', () => {
    const window = {
      setAlwaysOnTop: vi.fn(),
    }

    setWindowAlwaysOnTop(window, false)

    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(false)
  })

  it('applies standard always-on-top on Linux', () => {
    mocks.isMacOS = false
    mocks.isWindows = false

    const window = {
      setAlwaysOnTop: vi.fn(),
    }

    setWindowAlwaysOnTop(window, true)

    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true)
  })

  it('applies screen-saver level and relative offset on macOS', () => {
    mocks.isMacOS = true
    mocks.isWindows = false

    const window = {
      setAlwaysOnTop: vi.fn(),
    }

    setWindowAlwaysOnTop(window, true, 1)

    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver', 1)
  })

  it('applies screen-saver level and relative offset on Windows', () => {
    mocks.isMacOS = false
    mocks.isWindows = true

    const window = {
      setAlwaysOnTop: vi.fn(),
    }

    setWindowAlwaysOnTop(window, true, 2)

    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver', 2)
  })
})
