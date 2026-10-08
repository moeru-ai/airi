import type { OverlayWindow } from './controller'
import type { WindowMeta, WindowTracker } from './window-tracker'

import process from 'node:process'

import { Buffer } from 'node:buffer'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultDockConfig } from '..'
import { DockController } from './controller'

vi.mock('electron', () => ({
  screen: {
    getDisplayMatching: vi.fn(() => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } })),
  },
}))

const OVERLAY_TITLE = 'AIRI Dock Overlay'

function createWindowMeta(id: string, patch: Partial<WindowMeta> = {}): WindowMeta {
  return {
    id,
    title: id,
    ownerPid: 1,
    isOnScreen: true,
    isMinimized: false,
    isFullscreen: false,
    bounds: { x: 100, y: 100, width: 400, height: 300 },
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    ...patch,
  }
}

function createFakeOverlayWindow(id: number) {
  let destroyed = false
  return {
    id,
    destroy: vi.fn(() => {
      destroyed = true
    }),
    getNativeWindowHandle: vi.fn(() => Buffer.alloc(8)),
    getTitle: vi.fn(() => OVERLAY_TITLE),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => destroyed),
    setAlwaysOnTop: vi.fn(),
    setBounds: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    showInactive: vi.fn(),
  } satisfies OverlayWindow
}

type FakeOverlayWindow = ReturnType<typeof createFakeOverlayWindow>

function setup() {
  const windows = new Map<string, WindowMeta>()
  const above = new Map<string, WindowMeta[]>()
  const tracker = {
    listWindows: vi.fn(async () => [...windows.values()]),
    getWindowMeta: vi.fn(async (windowId: string) => windows.get(windowId)),
    getWindowsAbove: vi.fn(async (windowId: string) => above.get(windowId) ?? []),
  } satisfies WindowTracker

  // The fake overlays get Electron IDs 100, 101, and so on.
  const overlays: FakeOverlayWindow[] = []
  const createOverlayWindow = vi.fn<(signal: AbortSignal) => Promise<FakeOverlayWindow>>(async () => {
    const overlay = createFakeOverlayWindow(100 + overlays.length)
    overlays.push(overlay)
    return overlay
  })

  const controller = new DockController({ createOverlayWindow, tracker })
  return { controller, tracker, windows, above, overlays, createOverlayWindow }
}

async function startAndTick(controller: DockController, targetId: string) {
  await controller.start(targetId)
  await vi.advanceTimersByTimeAsync(0)
}

describe('dockController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('overlay lifecycle', () => {
    it('creates the overlay on the first start of a session and destroys it on stop', async () => {
      const { controller, windows, overlays, createOverlayWindow } = setup()
      windows.set('target', createWindowMeta('target'))
      windows.set('other', createWindowMeta('other'))

      expect(createOverlayWindow).not.toHaveBeenCalled()

      await controller.start('target')
      await controller.start('other')
      expect(createOverlayWindow).toHaveBeenCalledTimes(1)

      controller.stop()
      expect(overlays[0].destroy).toHaveBeenCalledTimes(1)

      await controller.start('target')
      expect(createOverlayWindow).toHaveBeenCalledTimes(2)
    })

    it('shares one overlay creation between concurrent starts, and the last start wins', async () => {
      const { controller, windows, createOverlayWindow } = setup()
      windows.set('first', createWindowMeta('first'))
      windows.set('second', createWindowMeta('second'))

      const [, state] = await Promise.all([controller.start('first'), controller.start('second')])

      expect(createOverlayWindow).toHaveBeenCalledTimes(1)
      expect(state.targetId).toBe('second')
    })

    it('destroys an overlay that finishes creation after stop', async () => {
      const { controller, tracker, windows, createOverlayWindow } = setup()
      windows.set('target', createWindowMeta('target'))
      const lateOverlay = createFakeOverlayWindow(7)
      let finishCreation!: (overlay: FakeOverlayWindow) => void
      createOverlayWindow.mockImplementationOnce(() => new Promise((resolve) => {
        finishCreation = resolve
      }))

      const starting = controller.start('target')
      controller.stop()
      finishCreation(lateOverlay)
      const state = await starting
      await vi.advanceTimersByTimeAsync(5000)

      expect(lateOverlay.destroy).toHaveBeenCalledTimes(1)
      expect(state.state).toBe('detached')
      expect(tracker.getWindowMeta).not.toHaveBeenCalled()
    })

    it('keeps a pending overlay for a start that follows a stop during the creation', async () => {
      const { controller, windows, createOverlayWindow } = setup()
      windows.set('first', createWindowMeta('first'))
      windows.set('second', createWindowMeta('second'))
      const overlay = createFakeOverlayWindow(7)
      let finishCreation!: (overlay: FakeOverlayWindow) => void
      createOverlayWindow.mockImplementationOnce(() => new Promise((resolve) => {
        finishCreation = resolve
      }))

      const first = controller.start('first')
      controller.stop()
      const second = controller.start('second')
      finishCreation(overlay)
      await Promise.all([first, second])
      await vi.advanceTimersByTimeAsync(0)

      expect(createOverlayWindow).toHaveBeenCalledTimes(1)
      expect(overlay.destroy).not.toHaveBeenCalled()
      expect(overlay.showInactive).toHaveBeenCalled()
      expect(controller.getDebugState().targetId).toBe('second')
      expect(controller.getDebugState().state).toBe('docking-attached-visible')
    })

    it('destroys an overlay that finishes creation after dispose', async () => {
      const { controller, tracker, windows, createOverlayWindow } = setup()
      windows.set('target', createWindowMeta('target'))
      const lateOverlay = createFakeOverlayWindow(7)
      let finishCreation!: (overlay: FakeOverlayWindow) => void
      createOverlayWindow.mockImplementationOnce(() => new Promise((resolve) => {
        finishCreation = resolve
      }))

      const starting = controller.start('target')
      controller.dispose()
      finishCreation(lateOverlay)
      const state = await starting
      await vi.advanceTimersByTimeAsync(5000)

      expect(lateOverlay.destroy).toHaveBeenCalledTimes(1)
      expect(state.state).toBe('detached')
      expect(state.lastReason).toBe('disposed')
      expect(tracker.getWindowMeta).not.toHaveBeenCalled()
    })

    it('does nothing on a start after dispose', async () => {
      const { controller, tracker, windows, createOverlayWindow } = setup()
      windows.set('target', createWindowMeta('target'))
      controller.dispose()

      const state = await controller.start('target')
      await vi.advanceTimersByTimeAsync(5000)

      expect(createOverlayWindow).not.toHaveBeenCalled()
      expect(tracker.getWindowMeta).not.toHaveBeenCalled()
      expect(state.state).toBe('detached')
      expect(state.lastReason).toBe('disposed')
      expect(state.targetId).toBeUndefined()
    })

    it('ends the session and rethrows when the overlay creation fails', async () => {
      const { controller, tracker, windows, createOverlayWindow } = setup()
      windows.set('target', createWindowMeta('target'))
      const error = new Error('load failed')
      createOverlayWindow.mockRejectedValueOnce(error)

      await expect(controller.start('target')).rejects.toBe(error)

      // The timer of the time limit is cleared, and no tick is scheduled.
      expect(vi.getTimerCount()).toBe(0)
      expect(controller.getDebugState().state).toBe('detached')
      expect(controller.getDebugState().lastReason).toBe('overlay-failed')
      expect(controller.getDebugState().targetId).toBeUndefined()
      expect(tracker.getWindowMeta).not.toHaveBeenCalled()

      await startAndTick(controller, 'target')

      expect(createOverlayWindow).toHaveBeenCalledTimes(2)
      expect(controller.getDebugState().state).toBe('docking-attached-visible')
    })

    it('fails the start at the 30 s limit, aborts the creation, and destroys an overlay that arrives later', async () => {
      const { controller, tracker, windows, createOverlayWindow } = setup()
      windows.set('target', createWindowMeta('target'))
      const lateOverlay = createFakeOverlayWindow(7)
      let finishCreation!: (overlay: FakeOverlayWindow) => void
      let signal!: AbortSignal
      createOverlayWindow.mockImplementationOnce(creationSignal => new Promise((resolve) => {
        signal = creationSignal
        finishCreation = resolve
      }))

      const starting = controller.start('target')
      const failure = expect(starting).rejects.toThrow('The overlay window was not created in 30000 ms.')
      await vi.advanceTimersByTimeAsync(29_999)

      expect(signal.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await failure

      expect(signal.aborted).toBe(true)
      expect(controller.getDebugState().state).toBe('detached')
      expect(controller.getDebugState().lastReason).toBe('overlay-failed')

      finishCreation(lateOverlay)
      await vi.advanceTimersByTimeAsync(5000)

      expect(lateOverlay.destroy).toHaveBeenCalledTimes(1)
      expect(lateOverlay.showInactive).not.toHaveBeenCalled()
      expect(tracker.getWindowMeta).not.toHaveBeenCalled()
    })

    it('ends the session and stops polling when something else destroys the overlay window', async () => {
      const { controller, tracker, windows, overlays, createOverlayWindow } = setup()
      windows.set('target', createWindowMeta('target'))
      await startAndTick(controller, 'target')

      overlays[0].destroy()
      const lookups = tracker.getWindowMeta.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)

      // The next tick ends the session before it reads the target.
      expect(tracker.getWindowMeta).toHaveBeenCalledTimes(lookups)
      expect(overlays[0].destroy).toHaveBeenCalledTimes(1)
      expect(overlays[0].setBounds).toHaveBeenCalledTimes(1)
      expect(controller.getDebugState().state).toBe('detached')
      expect(controller.getDebugState().lastReason).toBe('overlay-destroyed')
      expect(controller.getDebugState().targetId).toBeUndefined()
      expect(controller.getDebugState().pollIntervalMs).toBe(0)

      await controller.start('target')

      expect(createOverlayWindow).toHaveBeenCalledTimes(2)
    })

    it('does not let a tick of the old session end a start that creates a new overlay', async () => {
      const { controller, windows, overlays, createOverlayWindow } = setup()
      windows.set('first', createWindowMeta('first'))
      windows.set('second', createWindowMeta('second'))
      await startAndTick(controller, 'first')
      overlays[0].destroy()
      const overlay = createFakeOverlayWindow(7)
      let finishCreation!: (overlay: FakeOverlayWindow) => void
      createOverlayWindow.mockImplementationOnce(() => new Promise((resolve) => {
        finishCreation = resolve
      }))

      // The old session scheduled its next tick before this start. The tick fires during the creation.
      const starting = controller.start('second')
      await vi.advanceTimersByTimeAsync(1000)
      finishCreation(overlay)
      const state = await starting
      await vi.advanceTimersByTimeAsync(0)

      expect(overlay.destroy).not.toHaveBeenCalled()
      expect(overlay.showInactive).toHaveBeenCalled()
      expect(state.targetId).toBe('second')
      expect(controller.getDebugState().state).toBe('docking-attached-visible')
    })
  })

  describe('visibility', () => {
    it('shows the overlay on a frontmost target with the viewport and padding applied', async () => {
      const { controller, windows, overlays, createOverlayWindow } = setup()
      windows.set('target', createWindowMeta('target', { bounds: { x: 100, y: 100, width: 400, height: 300 } }))
      const configured = controller.updateConfig({ viewport: { left: 0.25, right: 0.75, top: 0, bottom: 0.5 }, padding: 10 })

      // A config update outside a session starts no session, creates no overlay, and schedules no tick.
      expect(configured.state).toBe('detached')
      expect(configured.targetId).toBeUndefined()
      expect(configured.pollIntervalMs).toBe(0)
      expect(createOverlayWindow).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)

      await startAndTick(controller, 'target')

      // Viewport: x 200 to 400, y 100 to 250. Padding adds 10 on each side.
      expect(overlays[0].setBounds).toHaveBeenCalledWith({ x: 190, y: 90, width: 220, height: 170 }, false)
      expect(overlays[0].setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver', 1)
      expect(overlays[0].showInactive).toHaveBeenCalled()
      expect(overlays[0].setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
      expect(controller.getDebugState().state).toBe('docking-attached-visible')
      expect(controller.getDebugState().lastReason).toBe('visible')
    })

    it('hides the overlay when a real window covers the target', async () => {
      const { controller, windows, above, overlays } = setup()
      windows.set('target', createWindowMeta('target'))
      above.set('target', [createWindowMeta('cover', { bounds: { x: 0, y: 0, width: 800, height: 600 } })])

      await startAndTick(controller, 'target')

      expect(overlays[0].hide).toHaveBeenCalled()
      expect(overlays[0].showInactive).not.toHaveBeenCalled()
      expect(controller.getDebugState().state).toBe('docking-attached-hidden')
      expect(controller.getDebugState().lastReason).toBe('not-frontmost')
      expect(controller.getDebugState().windowsAbove).toBe(1)
    })

    it('keeps the overlay visible on a covered target when hideWhenNotFrontmost is false', async () => {
      const { controller, windows, above, overlays } = setup()
      windows.set('target', createWindowMeta('target'))
      above.set('target', [createWindowMeta('cover', { bounds: { x: 0, y: 0, width: 800, height: 600 } })])
      controller.updateConfig({ hideWhenNotFrontmost: false })

      await startAndTick(controller, 'target')

      expect(overlays[0].showInactive).toHaveBeenCalled()
      expect(overlays[0].hide).not.toHaveBeenCalled()
      expect(controller.getDebugState().lastReason).toBe('visible-not-frontmost')
    })

    it('does not count small windows or the overlay as windows above the target', async () => {
      const { controller, windows, above, overlays } = setup()
      windows.set('target', createWindowMeta('target'))
      above.set('target', [
        createWindowMeta('tooltip', { bounds: { x: 120, y: 120, width: 40, height: 20 } }),
        createWindowMeta('electron:100', { bounds: { x: 100, y: 100, width: 400, height: 300 } }),
      ])

      await startAndTick(controller, 'target')

      expect(overlays[0].showInactive).toHaveBeenCalled()
      expect(controller.getDebugState().windowsAbove).toBe(0)
    })

    it('hides the overlay when the tracker reports a fullscreen target', async () => {
      const { controller, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target', { isFullscreen: true }))

      await startAndTick(controller, 'target')

      expect(overlays[0].hide).toHaveBeenCalled()
      expect(overlays[0].showInactive).not.toHaveBeenCalled()
      expect(controller.getDebugState().lastReason).toBe('target-fullscreen')
    })

    it('treats a target that fills the display within 6 DIP as fullscreen when the tracker gives no flag', async () => {
      const { controller, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target', {
        isFullscreen: undefined,
        bounds: { x: 3, y: -3, width: 1914, height: 1086 },
      }))

      await startAndTick(controller, 'target')

      expect(overlays[0].hide).toHaveBeenCalled()
      expect(controller.getDebugState().lastReason).toBe('target-fullscreen')
    })

    it('hides the overlay on a fullscreen or minimized target when hideWhenNotFrontmost is false', async () => {
      const { controller, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target', { isFullscreen: true }))
      controller.updateConfig({ hideWhenNotFrontmost: false })

      await startAndTick(controller, 'target')

      expect(overlays[0].showInactive).not.toHaveBeenCalled()
      expect(controller.getDebugState().lastReason).toBe('target-fullscreen')

      windows.set('target', createWindowMeta('target', { isMinimized: true }))
      await vi.advanceTimersByTimeAsync(1000)

      expect(overlays[0].showInactive).not.toHaveBeenCalled()
      expect(controller.getDebugState().lastReason).toBe('target-hidden')
    })

    it('hides the overlay but continues the session when the target is minimized', async () => {
      const { controller, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target', { isMinimized: true }))

      await startAndTick(controller, 'target')

      expect(overlays[0].hide).toHaveBeenCalled()
      expect(overlays[0].destroy).not.toHaveBeenCalled()
      expect(controller.getDebugState().state).toBe('companion')
      expect(controller.getDebugState().targetId).toBe('target')
    })
  })

  describe('polling', () => {
    it('polls at burstIntervalMs after the overlay shows or the target moves, and at activeIntervalMs after that', async () => {
      const { controller, tracker, windows } = setup()
      windows.set('target', createWindowMeta('target'))
      controller.updateConfig({ burstTicks: 2, burstIntervalMs: 20, activeIntervalMs: 100 })

      await startAndTick(controller, 'target')
      expect(controller.getDebugState().pollIntervalMs).toBe(20)

      await vi.advanceTimersByTimeAsync(20)
      expect(controller.getDebugState().pollIntervalMs).toBe(20)

      await vi.advanceTimersByTimeAsync(20)
      expect(controller.getDebugState().pollIntervalMs).toBe(100)
      expect(tracker.getWindowMeta).toHaveBeenCalledTimes(3)

      await vi.advanceTimersByTimeAsync(99)
      expect(tracker.getWindowMeta).toHaveBeenCalledTimes(3)

      windows.set('target', createWindowMeta('target', { bounds: { x: 150, y: 100, width: 400, height: 300 } }))
      await vi.advanceTimersByTimeAsync(1)
      expect(tracker.getWindowMeta).toHaveBeenCalledTimes(4)
      expect(controller.getDebugState().pollIntervalMs).toBe(20)
    })

    it('ends the session and stops polling when the target is lost', async () => {
      const { controller, tracker, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target'))
      await startAndTick(controller, 'target')
      expect(controller.getDebugState().state).toBe('docking-attached-visible')

      windows.delete('target')
      await vi.advanceTimersByTimeAsync(1000)
      const lookups = tracker.getWindowMeta.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)

      expect(overlays[0].destroy).toHaveBeenCalledTimes(1)
      expect(tracker.getWindowMeta).toHaveBeenCalledTimes(lookups)
      expect(controller.getDebugState().state).toBe('companion')
      expect(controller.getDebugState().lastReason).toBe('target-missing')
      expect(controller.getDebugState().targetId).toBeUndefined()
      expect(controller.getDebugState().pollIntervalMs).toBe(0)
    })

    it('stops polling and destroys the overlay on stop', async () => {
      const { controller, tracker, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target'))
      await startAndTick(controller, 'target')
      await vi.advanceTimersByTimeAsync(500)

      controller.stop()
      const lookups = tracker.getWindowMeta.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)

      expect(tracker.getWindowMeta).toHaveBeenCalledTimes(lookups)
      expect(overlays[0].destroy).toHaveBeenCalledTimes(1)
      expect(controller.getDebugState().state).toBe('detached')
      expect(controller.getDebugState().pollIntervalMs).toBe(0)
    })

    it('drops a tick that waited for the tracker while stop ran', async () => {
      const { controller, tracker, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target'))
      let finishLookup!: () => void
      tracker.getWindowMeta.mockImplementationOnce(async (windowId: string) => {
        await new Promise<void>((resolve) => {
          finishLookup = resolve
        })
        return windows.get(windowId)
      })

      await startAndTick(controller, 'target')
      controller.stop()
      finishLookup()
      await vi.advanceTimersByTimeAsync(10_000)

      expect(overlays[0].setBounds).not.toHaveBeenCalled()
      expect(overlays[0].showInactive).not.toHaveBeenCalled()
      expect(tracker.getWindowMeta).toHaveBeenCalledTimes(1)
      expect(controller.getDebugState().state).toBe('detached')
    })

    it('keeps the current session when a start targets the overlay', async () => {
      const { controller, tracker, windows } = setup()
      windows.set('target', createWindowMeta('target'))
      await startAndTick(controller, 'target')

      const state = await controller.start('electron:100')
      const lookups = tracker.getWindowMeta.mock.calls.length
      await vi.advanceTimersByTimeAsync(1000)

      expect(state.lastReason).toBe('overlay-target-blocked')
      expect(state.targetId).toBe('target')
      expect(tracker.getWindowMeta.mock.calls.length).toBeGreaterThan(lookups)
    })
  })

  describe('config', () => {
    it('rejects invalid updates and keeps the current config', async () => {
      const { controller, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target', { bounds: { x: 100, y: 100, width: 400, height: 300 } }))
      controller.updateConfig({ padding: 20 })

      // An empty number field on the devtools page sends an empty string.
      expect(() => controller.updateConfig({ activeIntervalMs: '' })).toThrow('activeIntervalMs: Invalid type')
      expect(() => controller.updateConfig({ activeIntervalMs: 5 })).toThrow('activeIntervalMs: Invalid value: Expected >=16 but received 5')
      expect(() => controller.updateConfig({ hiddenIntervalMs: 0 })).toThrow()
      expect(() => controller.updateConfig({ burstIntervalMs: Number.POSITIVE_INFINITY })).toThrow()
      expect(() => controller.updateConfig({ burstTicks: 1.5 })).toThrow()
      expect(() => controller.updateConfig({ padding: -1 })).toThrow()
      expect(() => controller.updateConfig({ viewport: { left: 0.8, right: 0.2, top: 0, bottom: 1 } })).toThrow('viewport: The viewport must have')
      expect(controller.getConfig()).toEqual({ ...defaultDockConfig, padding: 20 })

      await startAndTick(controller, 'target')

      expect(overlays[0].setBounds).toHaveBeenCalledWith({ x: 80, y: 80, width: 440, height: 340 }, false)
    })
  })

  describe('click-through', () => {
    it('stops click-through on a visible overlay when clickThrough changes to false', async () => {
      const { controller, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target'))
      await startAndTick(controller, 'target')
      expect(overlays[0].setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })

      controller.updateConfig({ clickThrough: false })
      await vi.advanceTimersByTimeAsync(100)

      expect(overlays[0].setIgnoreMouseEvents).toHaveBeenCalledTimes(2)
      expect(overlays[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
    })

    it('does not make a new overlay click-through when clickThrough is false', async () => {
      const { controller, windows, overlays } = setup()
      windows.set('target', createWindowMeta('target'))
      controller.updateConfig({ clickThrough: false })

      await startAndTick(controller, 'target')

      expect(overlays[0].showInactive).toHaveBeenCalled()
      expect(overlays[0].setIgnoreMouseEvents).not.toHaveBeenCalled()
    })
  })

  describe('target list', () => {
    it('drops the overlay by ID and by title, and keeps other windows', async () => {
      const { controller, windows } = setup()
      windows.set('target', createWindowMeta('target'))
      windows.set('electron:100', createWindowMeta('electron:100'))
      windows.set('win32:abc', createWindowMeta('win32:abc', { ownerPid: process.pid, title: OVERLAY_TITLE }))
      windows.set('other-app', createWindowMeta('other-app', { ownerPid: 1, title: OVERLAY_TITLE }))

      expect(await controller.listTargets()).toHaveLength(4)

      await controller.start('target')
      const ids = (await controller.listTargets()).map(window => window.id)

      expect(ids).toEqual(['target', 'other-app'])
    })
  })
})
