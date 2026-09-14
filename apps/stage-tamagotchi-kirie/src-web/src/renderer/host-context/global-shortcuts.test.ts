import type { GlobalShortcut, GlobalShortcutKeyEvent } from '@gd-kirie/platform'
import type { ShortcutBinding } from '@proj-airi/stage-shared/global-shortcut'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toKirieGlobalShortcut, useHostGlobalShortcuts } from './global-shortcuts'

const platform = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
}))

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {},
    platform: { globalShortcuts: platform },
    runtime: 'kirie',
  }),
}))

const binding: ShortcutBinding = {
  accelerator: {
    key: 'KeyK',
    modifiers: ['cmd-or-ctrl', 'shift'],
  },
  description: 'Test shortcut',
  id: 'test-shortcut',
  receiveKeyUps: true,
  scope: 'global',
}

describe('kirie global shortcuts', () => {
  const shortcuts = useHostGlobalShortcuts()

  beforeEach(async () => {
    platform.unregister.mockResolvedValue(undefined)
    await shortcuts.unregisterAll()
    platform.register.mockReset().mockResolvedValue(undefined)
    platform.unregister.mockReset().mockResolvedValue(undefined)
  })

  it('maps AIRI accelerators to Godot key values', () => {
    expect(toKirieGlobalShortcut(binding.accelerator)).toEqual({
      altPressed: false,
      commandOrControlAutoremap: true,
      ctrlPressed: false,
      keycode: 0x4B,
      metaPressed: false,
      shiftPressed: true,
    })
    expect(toKirieGlobalShortcut({ key: 'F12', modifiers: [] })?.keycode).toBe((1 << 22) | 0x27)
    expect(toKirieGlobalShortcut({ key: 'ArrowLeft', modifiers: [] })?.keycode).toBe((1 << 22) | 0x0F)
  })

  it('registers, lists, emits, and unregisters a shortcut', async () => {
    let onKeyEvent: ((event: GlobalShortcutKeyEvent) => void) | undefined
    platform.register.mockImplementation(async (_shortcut: GlobalShortcut, listener: (event: GlobalShortcutKeyEvent) => void) => {
      onKeyEvent = listener
    })
    const triggered = vi.fn()
    const stopListening = shortcuts.onTriggered(triggered)

    await expect(shortcuts.register(binding)).resolves.toEqual({ id: binding.id, ok: true })
    await expect(shortcuts.list()).resolves.toEqual([binding])

    onKeyEvent?.({ state: 'pressed' })
    onKeyEvent?.({ state: 'released' })
    expect(triggered).toHaveBeenNthCalledWith(1, { id: binding.id, phase: 'down' })
    expect(triggered).toHaveBeenNthCalledWith(2, { id: binding.id, phase: 'up' })

    await shortcuts.unregister(binding.id)
    expect(platform.unregister).toHaveBeenCalledWith(toKirieGlobalShortcut(binding.accelerator))
    await expect(shortcuts.list()).resolves.toEqual([])
    stopListening()
  })

  it('rejects duplicate identifiers before native registration', async () => {
    await shortcuts.register(binding)

    await expect(shortcuts.register(binding)).resolves.toEqual({
      id: binding.id,
      ok: false,
      reason: 'duplicate-id',
    })
    expect(platform.register).toHaveBeenCalledOnce()
  })

  it('drops release events when the binding did not request them', async () => {
    let onKeyEvent: ((event: GlobalShortcutKeyEvent) => void) | undefined
    platform.register.mockImplementation(async (_shortcut: GlobalShortcut, listener: (event: GlobalShortcutKeyEvent) => void) => {
      onKeyEvent = listener
    })
    const triggered = vi.fn()
    const stopListening = shortcuts.onTriggered(triggered)

    await shortcuts.register({ ...binding, receiveKeyUps: false })
    onKeyEvent?.({ state: 'pressed' })
    onKeyEvent?.({ state: 'released' })

    expect(triggered).toHaveBeenCalledOnce()
    expect(triggered).toHaveBeenCalledWith({ id: binding.id, phase: 'down' })
    stopListening()
  })

  it('rejects unknown keys before native registration', async () => {
    await expect(shortcuts.register({
      ...binding,
      accelerator: { key: 'UnknownKey', modifiers: ['ctrl'] },
    })).resolves.toEqual({
      id: binding.id,
      ok: false,
      reason: 'invalid',
    })
    expect(platform.register).not.toHaveBeenCalled()
  })

  it('keeps no local entry when native registration fails', async () => {
    const error = new Error('register failed')
    platform.register.mockRejectedValueOnce(error)

    await expect(shortcuts.register(binding)).rejects.toBe(error)
    await expect(shortcuts.list()).resolves.toEqual([])
  })
})
