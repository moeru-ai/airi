import type { GlobalShortcut, GlobalShortcutKeyEvent } from '@gd-kirie/platform'
import type { ShortcutAccelerator, ShortcutBinding } from '@proj-airi/stage-shared/global-shortcut'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toKirieGlobalShortcut, useHostGlobalShortcuts } from './global-shortcuts'
import {
  startHostOwnedSpotlightShortcut,
  useHostSpotlightShortcut,
  useHostSpotlightWindow,
} from './spotlight'

const invoke = vi.hoisted(() => vi.fn())
const openChat = vi.hoisted(() => vi.fn())
const notifications = vi.hoisted(() => ({
  onActivated: vi.fn(),
  show: vi.fn(),
}))
const platformShortcuts = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
}))
const listeners = vi.hoisted(() => new Set<(event: { body?: ShortcutAccelerator }) => void>())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const original = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...original,
    defineInvoke: (_context: unknown, event: { sendEvent: { id: string } }) => {
      return (...args: unknown[]) => invoke(event.sendEvent.id, ...args)
    },
  }
})

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {
      on: (
        _event: unknown,
        listener: (event: { body?: ShortcutAccelerator }) => void,
      ) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    platform: {
      globalShortcuts: platformShortcuts,
      notifications,
    },
    runtime: 'kirie',
  }),
}))

vi.mock('./chat', () => ({
  useHostChat: () => openChat,
}))

const accelerator: ShortcutAccelerator = {
  key: 'KeyA',
  modifiers: ['ctrl', 'shift'],
}

const rendererOwned: ShortcutBinding = {
  accelerator: {
    key: 'KeyK',
    modifiers: ['ctrl', 'shift'],
  },
  description: 'Test shortcut',
  id: 'test-shortcut',
  scope: 'global',
}

describe('spotlight host context', () => {
  beforeEach(async () => {
    listeners.clear()
    invoke.mockReset().mockImplementation(async (id: string) => {
      if (id === 'eventa:invoke:electron:windows:spotlight:shortcut:get-send')
        return accelerator
      return {}
    })
    openChat.mockReset().mockResolvedValue(undefined)
    notifications.show.mockReset().mockResolvedValue(undefined)
    notifications.onActivated.mockReset().mockReturnValue(vi.fn())
    platformShortcuts.register.mockReset().mockResolvedValue(undefined)
    platformShortcuts.unregister.mockReset().mockResolvedValue(undefined)
    await useHostGlobalShortcuts().unregisterAll()
    platformShortcuts.register.mockReset().mockResolvedValue(undefined)
    platformShortcuts.unregister.mockReset().mockResolvedValue(undefined)
  })

  it('hides through Kirie with an explicit empty payload', async () => {
    await useHostSpotlightWindow().hide()

    expect(invoke).toHaveBeenCalledWith(
      'eventa:invoke:electron:windows:spotlight:hide-send',
      {},
    )
  })

  it('shows a Platform notification and opens Chat on activation', async () => {
    let onActivated: ((event: { id: string }) => void) | undefined
    notifications.onActivated.mockImplementation((listener: (event: { id: string }) => void) => {
      onActivated = listener
      return vi.fn()
    })

    await useHostSpotlightWindow().showResultNotification('Hello from Spotlight')

    expect(notifications.show).toHaveBeenCalledWith({
      body: 'Hello from Spotlight',
      id: expect.stringMatching(/^spotlight-result-/),
      title: 'AIRI',
    })

    const notificationId = notifications.show.mock.calls[0]![0].id as string
    onActivated?.({ id: notificationId })
    expect(openChat).toHaveBeenCalledOnce()
  })

  it('gets and sets the accelerator through Eventa', async () => {
    const shortcut = useHostSpotlightShortcut()

    await expect(shortcut.get()).resolves.toEqual(accelerator)
    expect(invoke).toHaveBeenCalledWith(
      'eventa:invoke:electron:windows:spotlight:shortcut:get-send',
      {},
    )

    invoke.mockResolvedValueOnce({
      actualAccelerator: accelerator,
      id: 'spotlight',
      ok: true,
    })
    await expect(shortcut.set(accelerator)).resolves.toEqual({
      actualAccelerator: accelerator,
      id: 'spotlight',
      ok: true,
    })
    expect(invoke).toHaveBeenCalledWith(
      'eventa:invoke:electron:windows:spotlight:shortcut:set-send',
      { accelerator },
    )
  })

  it('registers the Spotlight shortcut outside the renderer-owned map', async () => {
    let onKeyEvent: ((event: GlobalShortcutKeyEvent) => void) | undefined
    platformShortcuts.register.mockImplementation(async (
      _shortcut: GlobalShortcut,
      listener: (event: GlobalShortcutKeyEvent) => void,
    ) => {
      onKeyEvent = listener
    })

    const stop = startHostOwnedSpotlightShortcut()
    await vi.waitFor(() => {
      expect(platformShortcuts.register).toHaveBeenCalledOnce()
    })

    expect(platformShortcuts.register).toHaveBeenCalledWith(
      toKirieGlobalShortcut(accelerator),
      expect.any(Function),
    )

    onKeyEvent?.({ state: 'pressed' })
    expect(invoke).toHaveBeenCalledWith(
      'eventa:invoke:electron:windows:spotlight:open-send',
      {},
    )

    await useHostGlobalShortcuts().register(rendererOwned)
    await useHostGlobalShortcuts().unregisterAll()
    expect(platformShortcuts.unregister).toHaveBeenCalledWith(toKirieGlobalShortcut(rendererOwned.accelerator))
    expect(platformShortcuts.unregister).not.toHaveBeenCalledWith(toKirieGlobalShortcut(accelerator))
    stop()
  })

  it('releases the host-owned shortcut when the page unloads', async () => {
    // ROOT CAUSE:
    //
    // The host keeps the registration across renderer page loads, and the key
    // callback it stores belongs to the page that registered it. A page that went
    // away without releasing left the accelerator claimed, so the next page's
    // register was rejected as a duplicate and the shortcut kept dispatching into
    // the unloaded page until the app restarted.
    //
    // We fixed this by releasing the registration from a `beforeunload` listener.
    const stop = startHostOwnedSpotlightShortcut()
    await vi.waitFor(() => {
      expect(platformShortcuts.register).toHaveBeenCalledOnce()
    })

    globalThis.dispatchEvent(new Event('beforeunload'))

    await vi.waitFor(() => {
      expect(platformShortcuts.unregister).toHaveBeenCalledWith(toKirieGlobalShortcut(accelerator))
    })
    stop()
  })

  it('rebinds when the host emits a shortcut change', async () => {
    const next: ShortcutAccelerator = {
      key: 'KeyB',
      modifiers: ['ctrl', 'alt'],
    }
    const stop = startHostOwnedSpotlightShortcut()
    await vi.waitFor(() => {
      expect(platformShortcuts.register).toHaveBeenCalledOnce()
    })

    for (const listener of listeners)
      listener({ body: next })

    await vi.waitFor(() => {
      expect(platformShortcuts.unregister).toHaveBeenCalledWith(toKirieGlobalShortcut(accelerator))
    })
    expect(platformShortcuts.register).toHaveBeenLastCalledWith(
      toKirieGlobalShortcut(next),
      expect.any(Function),
    )
    stop()
  })
})
