import { describe, expect, it, vi } from 'vitest'

import { resizeBoundsByDelta, setupBaseWindowElectronInvokes, setWindowAlwaysOnTop } from './window'

const mocks = vi.hoisted(() => ({
  isMacOS: false,
  isWindows: false,
}))

const createI18nServiceMock = vi.hoisted(() => vi.fn())
const createServerChannelServiceMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/airi/i18n', () => ({
  createI18nService: createI18nServiceMock,
}))

vi.mock('../../services/airi/channel-server', () => ({
  createServerChannelService: createServerChannelServiceMock,
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

describe('resizeBoundsByDelta', () => {
  it('keeps the opposite corner still while a corner grip is dragged', () => {
    const bounds = { x: 100, y: 100, width: 400, height: 500 }

    expect(resizeBoundsByDelta(bounds, { deltaX: -20, deltaY: -30, direction: 'nw' }))
      .toEqual({ x: 80, y: 70, width: 420, height: 530 })
    expect(resizeBoundsByDelta(bounds, { deltaX: 20, deltaY: 30, direction: 'se' }))
      .toEqual({ x: 100, y: 100, width: 420, height: 530 })
  })

  it('stops at the minimum size and keeps the opposite edges still', () => {
    const bounds = { x: 100, y: 100, width: 400, height: 500 }

    expect(resizeBoundsByDelta(bounds, { deltaX: 1000, deltaY: 1000, direction: 'nw', minWidth: 300, minHeight: 250 }))
      .toEqual({ x: 200, y: 350, width: 300, height: 250 })
  })
})

describe('setupBaseWindowElectronInvokes', () => {
  it('rejects when window is destroyed before setup', async () => {
    createI18nServiceMock.mockClear()
    createServerChannelServiceMock.mockClear()

    const window = { isDestroyed: vi.fn(() => true) } as never
    await expect(
      setupBaseWindowElectronInvokes({
        context: {} as never,
        window,
        serverChannel: {} as never,
        i18n: {} as never,
      }),
    ).rejects.toThrow('Window was closed before base invokes setup')
    expect(createI18nServiceMock).not.toHaveBeenCalled()
  })

  it('rejects when signal is already aborted', async () => {
    createI18nServiceMock.mockClear()
    createServerChannelServiceMock.mockClear()

    const window = { isDestroyed: vi.fn(() => false) } as never
    const signal = AbortSignal.abort(new Error('Widget window was closed during setup'))
    await expect(
      setupBaseWindowElectronInvokes({
        context: {} as never,
        window,
        serverChannel: {} as never,
        i18n: {} as never,
        signal,
      }),
    ).rejects.toThrow('Window was closed before base invokes setup')
    expect(createI18nServiceMock).not.toHaveBeenCalled()
  })

  it('rejects and skips server channel registration when window is destroyed during i18n setup', async () => {
    createI18nServiceMock.mockClear()
    createServerChannelServiceMock.mockClear()

    let isDestroyed = false
    const window = { isDestroyed: vi.fn(() => isDestroyed) } as never
    createI18nServiceMock.mockImplementationOnce(async () => {
      isDestroyed = true
    })

    await expect(
      setupBaseWindowElectronInvokes({
        context: {} as never,
        window,
        serverChannel: {} as never,
        i18n: {} as never,
      }),
    ).rejects.toThrow('Window was closed during base invokes setup')
    expect(createServerChannelServiceMock).not.toHaveBeenCalled()
  })
})
