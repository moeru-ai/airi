import type { ShortcutBinding } from '@proj-airi/stage-shared/global-shortcut'

import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Builds a binding for the uiohook driver.
 *
 * Defaults to `receiveKeyUps: true` because that flag is the dispatch
 * signal in the orchestrator; the driver itself does not inspect it,
 * but tests stay closer to how callers will use the driver this way.
 *
 * @example
 *   exampleBinding('ptt')
 *   // => { id: 'ptt', accelerator: { modifiers: ['shift'], key: 'KeyK' },
 *   //      scope: 'global', receiveKeyUps: true }
 */
function exampleBinding(id: string, modifiers: ShortcutBinding['accelerator']['modifiers'] = ['shift'], key = 'KeyK'): ShortcutBinding {
  return {
    id,
    accelerator: { modifiers, key },
    scope: 'global',
    receiveKeyUps: true,
  }
}

interface KeyboardEvent {
  keycode: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

function event(partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'keycode'>): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...partial,
  }
}

/**
 * Wires mocks for `uiohook-napi` (singleton + listeners) and the
 * `electron` `systemPreferences` surface, then imports the driver
 * factory under test.
 *
 * @example
 *   const m = await setupMocks()
 *   const driver = m.createUiohookDriver({ ... })
 *   m.fire('keydown', event({ keycode: 37 }))
 */
async function setupMocks() {
  const onMock = vi.fn()
  const removeListenerMock = vi.fn()
  const startMock = vi.fn()
  const stopMock = vi.fn()
  const isTrustedAccessibilityClientMock = vi.fn(() => true)

  const listeners = new Map<string, Array<(e: KeyboardEvent) => void>>()

  onMock.mockImplementation((event: string, listener: (e: KeyboardEvent) => void) => {
    const arr = listeners.get(event) ?? []
    arr.push(listener)
    listeners.set(event, arr)
  })

  removeListenerMock.mockImplementation((event: string, listener: (e: KeyboardEvent) => void) => {
    const arr = listeners.get(event)
    if (!arr)
      return
    listeners.set(event, arr.filter(l => l !== listener))
  })

  // Mirrors the literal subset of `UiohookKey` that exercises the
  // mapper. KeyK = 37, KeyA = 30 (matches real upstream constants so
  // tests assert real keycodes, not arbitrary numbers).
  const UiohookKey = {
    K: 37,
    A: 30,
    Q: 16,
  } as const

  vi.doMock('uiohook-napi', () => ({
    uIOhook: {
      on: onMock,
      removeListener: removeListenerMock,
      start: startMock,
      stop: stopMock,
    },
    UiohookKey,
  }))

  vi.doMock('electron', () => ({
    systemPreferences: {
      isTrustedAccessibilityClient: isTrustedAccessibilityClientMock,
    },
  }))

  const { createUiohookDriver } = await import('./global-shortcut-uiohook')

  function fire(name: 'keydown' | 'keyup', e: KeyboardEvent): void {
    for (const listener of listeners.get(name) ?? [])
      listener(e)
  }

  function createDriver(overrides: { platform?: NodeJS.Platform, sessionType?: string } = {}) {
    const broadcastTriggered = vi.fn<(id: string, phase: 'down' | 'up') => void>()
    const logger = {
      warn: vi.fn(),
      withError: vi.fn(() => ({ warn: vi.fn() })),
    }
    const driver = createUiohookDriver({
      broadcastTriggered,
      logger: logger as unknown as Parameters<typeof createUiohookDriver>[0]['logger'],
      platform: overrides.platform ?? 'darwin',
      sessionType: overrides.sessionType,
    })
    return { driver, broadcastTriggered, logger }
  }

  return {
    onMock,
    removeListenerMock,
    startMock,
    stopMock,
    isTrustedAccessibilityClientMock,
    fire,
    createDriver,
  }
}

describe('createUiohookDriver', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('starts the OS hook lazily and installs keydown/keyup listeners on first registration', async () => {
    const m = await setupMocks()
    const { driver } = m.createDriver()

    expect(m.startMock).not.toHaveBeenCalled()
    expect(m.onMock).not.toHaveBeenCalled()

    const result = driver.tryRegister(exampleBinding('ptt'))

    expect(result).toEqual({ id: 'ptt', ok: true })
    expect(m.startMock).toHaveBeenCalledTimes(1)
    expect(m.onMock).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(m.onMock).toHaveBeenCalledWith('keyup', expect.any(Function))
  })

  it('stops the OS hook only after the last binding is unregistered', async () => {
    const m = await setupMocks()
    const { driver } = m.createDriver()

    driver.tryRegister(exampleBinding('a', ['shift'], 'KeyA'))
    driver.tryRegister(exampleBinding('b', ['shift'], 'KeyQ'))
    expect(m.stopMock).not.toHaveBeenCalled()

    driver.unregisterById('a')
    expect(m.stopMock).not.toHaveBeenCalled()

    driver.unregisterById('b')
    expect(m.stopMock).toHaveBeenCalledTimes(1)
  })

  it('broadcasts a "down" event when a matching keydown arrives', async () => {
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver()
    driver.tryRegister(exampleBinding('ptt', ['shift'], 'KeyK'))

    m.fire('keydown', event({ keycode: 37, shiftKey: true }))

    expect(broadcastTriggered).toHaveBeenCalledTimes(1)
    expect(broadcastTriggered).toHaveBeenCalledWith('ptt', 'down')
  })

  it('suppresses OS auto-repeat — repeated keydowns between matching down/up collapse to one broadcast', async () => {
    // ROOT CAUSE:
    //
    // libuiohook reports the OS-level keydown stream verbatim, which
    // includes auto-repeat events while the key remains physically
    // held. Without per-binding `pressed` tracking, a held PTT key
    // would emit hundreds of `down` broadcasts per second and the mic
    // would start/stop frantically.
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver()
    driver.tryRegister(exampleBinding('ptt', ['shift'], 'KeyK'))

    m.fire('keydown', event({ keycode: 37, shiftKey: true }))
    m.fire('keydown', event({ keycode: 37, shiftKey: true }))
    m.fire('keydown', event({ keycode: 37, shiftKey: true }))

    const downCalls = broadcastTriggered.mock.calls.filter(c => c[1] === 'down')
    expect(downCalls).toHaveLength(1)
  })

  it('broadcasts "up" on matching keyup and re-arms the binding for the next press', async () => {
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver()
    driver.tryRegister(exampleBinding('ptt', ['shift'], 'KeyK'))

    m.fire('keydown', event({ keycode: 37, shiftKey: true }))
    m.fire('keyup', event({ keycode: 37, shiftKey: false }))
    m.fire('keydown', event({ keycode: 37, shiftKey: true }))

    expect(broadcastTriggered).toHaveBeenNthCalledWith(1, 'ptt', 'down')
    expect(broadcastTriggered).toHaveBeenNthCalledWith(2, 'ptt', 'up')
    expect(broadcastTriggered).toHaveBeenNthCalledWith(3, 'ptt', 'down')
  })

  it('matches keyup by keycode even when modifiers were released before the main key', async () => {
    // NOTICE:
    // Users routinely release the modifier first (e.g. let Cmd go
    // before letting K go). The keyup event for K therefore carries
    // `metaKey: false`, which would fail strict modifier matching.
    // The driver keys the "up" broadcast off the prior `pressed`
    // state rather than the modifier predicate.
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver()
    driver.tryRegister(exampleBinding('ptt', ['cmd-or-ctrl'], 'KeyK'))

    m.fire('keydown', event({ keycode: 37, metaKey: true }))
    m.fire('keyup', event({ keycode: 37, metaKey: false }))

    expect(broadcastTriggered).toHaveBeenCalledWith('ptt', 'down')
    expect(broadcastTriggered).toHaveBeenCalledWith('ptt', 'up')
  })

  it('ignores keyup when no matching keydown was tracked', async () => {
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver()
    driver.tryRegister(exampleBinding('ptt', ['shift'], 'KeyK'))

    m.fire('keyup', event({ keycode: 37, shiftKey: true }))

    expect(broadcastTriggered).not.toHaveBeenCalled()
  })

  it('does not match a keydown that carries an extra modifier', async () => {
    // Strict matching mirrors Electron's accelerator semantics: a
    // `Shift+K` binding must not fire on `Cmd+Shift+K`.
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver()
    driver.tryRegister(exampleBinding('ptt', ['shift'], 'KeyK'))

    m.fire('keydown', event({ keycode: 37, shiftKey: true, metaKey: true }))

    expect(broadcastTriggered).not.toHaveBeenCalled()
  })

  it('maps cmd-or-ctrl to metaKey on darwin', async () => {
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver({ platform: 'darwin' })
    driver.tryRegister(exampleBinding('ptt', ['cmd-or-ctrl'], 'KeyK'))

    m.fire('keydown', event({ keycode: 37, metaKey: true }))
    m.fire('keydown', event({ keycode: 37, ctrlKey: true }))

    expect(broadcastTriggered).toHaveBeenCalledTimes(1)
    expect(broadcastTriggered).toHaveBeenCalledWith('ptt', 'down')
  })

  it('maps cmd-or-ctrl to ctrlKey on non-darwin platforms', async () => {
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver({ platform: 'win32' })
    driver.tryRegister(exampleBinding('ptt', ['cmd-or-ctrl'], 'KeyK'))

    m.fire('keydown', event({ keycode: 37, ctrlKey: true }))
    m.fire('keydown', event({ keycode: 37, metaKey: true }))

    // First (ctrl) matches; second (meta) does not — the pressed
    // state stays cleared and produces no extra broadcast.
    expect(broadcastTriggered).toHaveBeenCalledTimes(1)
    expect(broadcastTriggered).toHaveBeenCalledWith('ptt', 'down')
  })

  it('rejects duplicate ids with reason "duplicate-id" and does not double-start the hook', async () => {
    const m = await setupMocks()
    const { driver } = m.createDriver()

    expect(driver.tryRegister(exampleBinding('ptt'))).toEqual({ id: 'ptt', ok: true })
    const second = driver.tryRegister(exampleBinding('ptt'))
    expect(second).toEqual({ id: 'ptt', ok: false, reason: ShortcutFailureReasons.DuplicateId })
    expect(m.startMock).toHaveBeenCalledTimes(1)
  })

  it('returns Unsupported under a native Wayland session', async () => {
    const m = await setupMocks()
    const { driver } = m.createDriver({ platform: 'linux', sessionType: 'wayland' })

    const result = driver.tryRegister(exampleBinding('ptt'))
    expect(result).toEqual({ id: 'ptt', ok: false, reason: ShortcutFailureReasons.Unsupported })
    expect(m.startMock).not.toHaveBeenCalled()
  })

  it('permits registration on Linux under X11 / XWayland', async () => {
    const m = await setupMocks()
    const { driver } = m.createDriver({ platform: 'linux', sessionType: 'x11' })

    expect(driver.tryRegister(exampleBinding('ptt'))).toEqual({ id: 'ptt', ok: true })
    expect(m.startMock).toHaveBeenCalledTimes(1)
  })

  it('returns Denied when macOS Accessibility permission is not granted', async () => {
    const m = await setupMocks()
    m.isTrustedAccessibilityClientMock.mockReturnValue(false)
    const { driver } = m.createDriver({ platform: 'darwin' })

    const result = driver.tryRegister(exampleBinding('ptt'))
    expect(result).toEqual({ id: 'ptt', ok: false, reason: ShortcutFailureReasons.Denied })
    expect(m.isTrustedAccessibilityClientMock).toHaveBeenCalledWith(true)
    expect(m.startMock).not.toHaveBeenCalled()
  })

  it('skips the Accessibility check entirely on non-darwin', async () => {
    const m = await setupMocks()
    const { driver } = m.createDriver({ platform: 'win32' })
    driver.tryRegister(exampleBinding('ptt'))
    expect(m.isTrustedAccessibilityClientMock).not.toHaveBeenCalled()
  })

  it('unregisterAll clears every binding and stops the hook in one shot', async () => {
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver()

    driver.tryRegister(exampleBinding('a', ['shift'], 'KeyA'))
    driver.tryRegister(exampleBinding('b', ['shift'], 'KeyQ'))
    driver.unregisterAll()

    m.fire('keydown', event({ keycode: 30, shiftKey: true }))
    m.fire('keydown', event({ keycode: 16, shiftKey: true }))

    expect(broadcastTriggered).not.toHaveBeenCalled()
    expect(m.stopMock).toHaveBeenCalledTimes(1)
  })

  it('dispose removes the keydown/keyup listeners', async () => {
    const m = await setupMocks()
    const { driver } = m.createDriver()
    driver.tryRegister(exampleBinding('ptt'))

    driver.dispose()

    expect(m.removeListenerMock).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(m.removeListenerMock).toHaveBeenCalledWith('keyup', expect.any(Function))
  })

  it('keeps per-binding pressed state independent across multiple bindings', async () => {
    const m = await setupMocks()
    const { driver, broadcastTriggered } = m.createDriver()
    driver.tryRegister(exampleBinding('a', ['shift'], 'KeyA'))
    driver.tryRegister(exampleBinding('b', ['shift'], 'KeyQ'))

    m.fire('keydown', event({ keycode: 30, shiftKey: true }))
    m.fire('keydown', event({ keycode: 16, shiftKey: true }))
    m.fire('keyup', event({ keycode: 30 }))

    expect(broadcastTriggered).toHaveBeenNthCalledWith(1, 'a', 'down')
    expect(broadcastTriggered).toHaveBeenNthCalledWith(2, 'b', 'down')
    expect(broadcastTriggered).toHaveBeenNthCalledWith(3, 'a', 'up')
  })
})
