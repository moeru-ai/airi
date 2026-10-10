import { platform } from 'node:process'

import { createContext, defineInvoke } from '@moeru/eventa'
import { electron, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { desktopCapabilitiesChanged, desktopCapabilitiesGet, desktopCursorSample } from '../../../shared/eventa/desktop-companion'
import { createScreenService } from './screen'

const mocks = vi.hoisted(() => {
  const display = { id: 7, bounds: { x: -1920, y: -200, width: 1920, height: 1080 }, workArea: { x: -1920, y: -200, width: 1920, height: 1040 }, scaleFactor: 2 }
  return {
    ozone: 'x11',
    displays: [display],
    display,
    cursor: vi.fn(() => ({ x: -1700, y: -100 })),
    start: vi.fn(),
    stop: vi.fn(),
    run: undefined as (() => void | Promise<void>) | undefined,
    on: vi.fn(),
    removeListener: vi.fn(),
  }
})

vi.mock('electron', () => ({
  app: { commandLine: { getSwitchValue: () => mocks.ozone } },
  Notification: { isSupported: () => true },
  screen: {
    getAllDisplays: () => mocks.displays,
    getPrimaryDisplay: () => mocks.display,
    getCursorScreenPoint: mocks.cursor,
    getDisplayNearestPoint: () => mocks.display,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}))
vi.mock('@proj-airi/electron-vueuse/main', () => ({
  createRendererLoop: (input: { run: () => void | Promise<void> }) => {
    mocks.run = input.run
    return { start: mocks.start, stop: mocks.stop }
  },
}))

function setup() {
  const context = createContext()
  const closed = vi.fn()
  const window = { getContentBounds: () => ({ x: -1800, y: -200, width: 450, height: 600 }), webContents: { getZoomFactor: () => 1.25 }, once: closed }
  createScreenService({ context: context as never, window: window as never })
  return { context, closed }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ozone = 'x11'
  mocks.displays = [mocks.display]
})

describe('electron desktop screen boundary', () => {
  it('starts supported polling and emits CSS-local coordinates with display identity', async () => {
    const { context } = setup()
    const sample = vi.fn()
    context.on(desktopCursorSample, event => sample(event.body))
    await defineInvoke(context, startLoopGetCursorScreenPoint)()
    await mocks.run?.()
    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.cursor).toHaveBeenCalledTimes(1)
    expect(sample).toHaveBeenCalledWith(expect.objectContaining({ localCss: { x: 80, y: 80 }, displayId: 7, layoutRevision: 0 }))
  })

  it.runIf(platform === 'linux')('does not poll or return false global coordinates on native Wayland', async () => {
    mocks.ozone = 'wayland'
    const { context } = setup()
    await defineInvoke(context, startLoopGetCursorScreenPoint)()
    await mocks.run?.()
    const capabilities = await defineInvoke(context, desktopCapabilitiesGet)()
    expect(capabilities.globalCursor).toBe('unsupported')
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.cursor).not.toHaveBeenCalled()
    await expect(defineInvoke(context, electron.screen.getCursorScreenPoint)()).rejects.toThrow('unavailable')
  })

  it('invalidates old samples and emits a new layout after display hotplug', async () => {
    const { context } = setup()
    const topology = vi.fn()
    const sample = vi.fn()
    context.on(desktopCapabilitiesChanged, event => topology(event.body))
    context.on(desktopCursorSample, event => sample(event.body))
    mocks.displays = []
    const removed = mocks.on.mock.calls.find(([name]) => name === 'display-removed')?.[1]
    removed()
    expect(sample).toHaveBeenCalledWith(null)
    expect(topology).toHaveBeenCalledWith(expect.objectContaining({ displays: [], layoutRevision: 1 }))
    expect((await defineInvoke(context, desktopCapabilitiesGet)()).displays).toEqual([])
  })

  it('removes each display listener when its window closes', () => {
    const { closed } = setup()
    const close = closed.mock.calls.find(([name]) => name === 'closed')?.[1]
    close()
    expect(mocks.removeListener).toHaveBeenCalledWith('display-added', expect.any(Function))
    expect(mocks.removeListener).toHaveBeenCalledWith('display-removed', expect.any(Function))
    expect(mocks.removeListener).toHaveBeenCalledWith('display-metrics-changed', expect.any(Function))
  })
})
