import type { GlobalShortcut, GlobalShortcutKeyEvent } from '@gd-kirie/platform'
import type {
  ShortcutAccelerator,
  ShortcutBinding,
  ShortcutRegistrationResult,
} from '@proj-airi/stage-shared/global-shortcut'

import type { ElectronShortcutTriggerPayload } from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'

import {
  electronShortcutList,
  electronShortcutRegister,
  electronShortcutTriggered,
  electronShortcutUnregister,
  electronShortcutUnregisterAll,
} from '../../shared/eventa'
import { initializeHostContext } from './owner'

type TriggerListener = (payload: ElectronShortcutTriggerPayload) => void

export interface HostGlobalShortcuts {
  list: () => Promise<ShortcutBinding[]>
  onTriggered: (listener: TriggerListener) => () => void
  register: (binding: ShortcutBinding) => Promise<ShortcutRegistrationResult>
  unregister: (id: string) => Promise<void>
  unregisterAll: () => Promise<void>
}

interface KirieRegistration {
  binding: ShortcutBinding
  shortcut: GlobalShortcut
}

const GODOT_SPECIAL_KEY = 1 << 22

const NAMED_KEYCODES: Readonly<Record<string, number>> = {
  ArrowDown: GODOT_SPECIAL_KEY | 0x12,
  ArrowLeft: GODOT_SPECIAL_KEY | 0x0F,
  ArrowRight: GODOT_SPECIAL_KEY | 0x11,
  ArrowUp: GODOT_SPECIAL_KEY | 0x10,
  Backquote: 0x60,
  Backslash: 0x5C,
  Backspace: GODOT_SPECIAL_KEY | 0x04,
  BracketLeft: 0x5B,
  BracketRight: 0x5D,
  Comma: 0x2C,
  Delete: GODOT_SPECIAL_KEY | 0x08,
  End: GODOT_SPECIAL_KEY | 0x0E,
  Enter: GODOT_SPECIAL_KEY | 0x05,
  Equal: 0x3D,
  Escape: GODOT_SPECIAL_KEY | 0x01,
  Home: GODOT_SPECIAL_KEY | 0x0D,
  Insert: GODOT_SPECIAL_KEY | 0x07,
  Minus: 0x2D,
  PageDown: GODOT_SPECIAL_KEY | 0x14,
  PageUp: GODOT_SPECIAL_KEY | 0x13,
  Period: 0x2E,
  Quote: 0x27,
  Semicolon: 0x3B,
  Slash: 0x2F,
  Space: 0x20,
  Tab: GODOT_SPECIAL_KEY | 0x02,
}

function godotKeycode(key: string): number | undefined {
  if (/^Key[A-Z]$/.test(key))
    return key.charCodeAt(3)

  if (/^Digit\d$/.test(key))
    return key.charCodeAt(5)

  const functionKey = /^F([1-9]|1\d|2[0-4])$/.exec(key)
  if (functionKey)
    return GODOT_SPECIAL_KEY | (0x1B + Number(functionKey[1]))

  return NAMED_KEYCODES[key]
}

export function toKirieGlobalShortcut(accelerator: ShortcutAccelerator): GlobalShortcut | undefined {
  const keycode = godotKeycode(accelerator.key)
  if (keycode === undefined)
    return undefined

  const modifiers = new Set(accelerator.modifiers)

  return {
    altPressed: modifiers.has('alt'),
    commandOrControlAutoremap: modifiers.has('cmd-or-ctrl'),
    ctrlPressed: modifiers.has('ctrl'),
    keycode,
    metaPressed: modifiers.has('cmd') || modifiers.has('super'),
    shiftPressed: modifiers.has('shift'),
  }
}

function createElectronGlobalShortcuts(): HostGlobalShortcuts {
  const { context } = initializeHostContext()
  const list = defineInvoke(context, electronShortcutList)
  const register = defineInvoke(context, electronShortcutRegister)
  const unregister = defineInvoke(context, electronShortcutUnregister)
  const unregisterAll = defineInvoke(context, electronShortcutUnregisterAll)

  return {
    list,
    onTriggered(listener) {
      return context.on(electronShortcutTriggered, ({ body }) => {
        if (body)
          listener(body)
      })
    },
    register,
    async unregister(id) {
      await unregister({ id })
    },
    async unregisterAll() {
      await unregisterAll()
    },
  }
}

function createKirieGlobalShortcuts(): HostGlobalShortcuts {
  const host = initializeHostContext()
  const registrations = new Map<string, KirieRegistration>()
  const listeners = new Set<TriggerListener>()

  function emitTriggered(id: string, event: GlobalShortcutKeyEvent) {
    const phase = event.state === 'pressed' ? 'down' : 'up'
    for (const listener of listeners)
      listener({ id, phase })
  }

  async function unregister(id: string) {
    const registration = registrations.get(id)
    if (!registration)
      return

    await host.platform!.globalShortcuts.unregister(registration.shortcut)
    registrations.delete(id)
  }

  return {
    async list() {
      return Array.from(registrations.values(), registration => registration.binding)
    },
    onTriggered(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async register(binding) {
      if (registrations.has(binding.id)) {
        return {
          id: binding.id,
          ok: false,
          reason: ShortcutFailureReasons.DuplicateId,
        }
      }

      const shortcut = toKirieGlobalShortcut(binding.accelerator)
      if (!shortcut) {
        return {
          id: binding.id,
          ok: false,
          reason: ShortcutFailureReasons.Invalid,
        }
      }

      await host.platform!.globalShortcuts.register(
        shortcut,
        (event) => {
          if (event.state === 'pressed' || binding.receiveKeyUps)
            emitTriggered(binding.id, event)
        },
      )
      registrations.set(binding.id, { binding, shortcut })

      return { id: binding.id, ok: true }
    },
    unregister,
    async unregisterAll() {
      for (const id of Array.from(registrations.keys()))
        await unregister(id)
    },
  }
}

let shortcuts: HostGlobalShortcuts | undefined

export function useHostGlobalShortcuts(): HostGlobalShortcuts {
  const host = initializeHostContext()
  shortcuts ??= host.runtime === 'kirie'
    ? createKirieGlobalShortcuts()
    : createElectronGlobalShortcuts()
  return shortcuts
}
