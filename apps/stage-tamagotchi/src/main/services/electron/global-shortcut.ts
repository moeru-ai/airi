import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { ShortcutBinding, ShortcutRegistrationResult } from '@proj-airi/stage-shared/global-shortcut'
import type { BrowserWindow } from 'electron'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { formatElectronAccelerator, ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { globalShortcut } from 'electron'

import {
  electronShortcutList,
  electronShortcutRegister,
  electronShortcutTriggered,
  electronShortcutUnregister,
  electronShortcutUnregisterAll,
} from '../../../shared/eventa'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { createUiohookDriver } from './global-shortcut-uiohook'

export type EventaContext = ReturnType<typeof createContext>['context']

export interface RegisterWindowParams {
  context: EventaContext
  window: BrowserWindow
}

export interface RegisterMainShortcutParams {
  binding: ShortcutBinding
  onTriggered: () => void
}

export interface GlobalShortcutService {
  registerWindow: (params: RegisterWindowParams) => void
  registerMainShortcut: (params: RegisterMainShortcutParams) => ShortcutRegistrationResult
  dispose: () => void
}

type ActiveBinding
  = | { binding: ShortcutBinding, owner: 'renderer', driver: 'electron', electronAccelerator: string }
    | { binding: ShortcutBinding, owner: 'main', driver: 'electron', electronAccelerator: string, onTriggered: () => void }
    | { binding: ShortcutBinding, owner: 'renderer', driver: 'uiohook' }

export function setupGlobalShortcutService(): GlobalShortcutService {
  const log = useLogg('global-shortcut').useGlobalConfig()

  const contexts = new Set<EventaContext>()
  const active = new Map<string, ActiveBinding>()

  function broadcastTriggered(id: string, phase: 'down' | 'up') {
    for (const context of contexts) {
      try {
        context.emit(electronShortcutTriggered, { id, phase })
      }
      catch (error) {
        log.withError(error).warn(`Failed to emit shortcut trigger for "${id}"`)
      }
    }
  }

  const uiohookDriver = createUiohookDriver({
    broadcastTriggered,
    logger: log,
  })

  function tryRegisterElectron(binding: ShortcutBinding): ShortcutRegistrationResult {
    const electronAccelerator = formatElectronAccelerator(binding.accelerator)
    const ok = globalShortcut.register(electronAccelerator, () => broadcastTriggered(binding.id, 'down'))

    if (!ok) {
      // `globalShortcut.register` returns false for several distinct
      // causes (held by another app, or denied by the OS for media
      // keys / Accessibility-gated combos on macOS). Electron does not
      // expose which case applied, so this driver reports `Conflict`
      // for both. The uiohook driver path can emit `Denied` directly.
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.Conflict }
    }

    active.set(binding.id, { binding, owner: 'renderer', driver: 'electron', electronAccelerator })
    return { id: binding.id, ok: true }
  }

  function tryRegisterUiohook(binding: ShortcutBinding): ShortcutRegistrationResult {
    const result = uiohookDriver.tryRegister(binding)
    if (result.ok)
      active.set(binding.id, { binding, owner: 'renderer', driver: 'uiohook' })
    return result
  }

  // Main-owned shortcuts stay live without a renderer context.
  function registerMainShortcut({ binding, onTriggered }: RegisterMainShortcutParams): ShortcutRegistrationResult {
    const existing = active.get(binding.id)
    if (existing && existing.owner !== 'main')
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.DuplicateId }

    const electronAccelerator = formatElectronAccelerator(binding.accelerator)
    const nextEntry: ActiveBinding = { binding, owner: 'main', driver: 'electron', electronAccelerator, onTriggered }
    if (existing?.electronAccelerator === electronAccelerator) {
      releaseEntry(binding.id, existing)
      if (globalShortcut.register(electronAccelerator, onTriggered)) {
        active.set(binding.id, nextEntry)
        return { id: binding.id, ok: true }
      }

      if (globalShortcut.register(existing.electronAccelerator, existing.onTriggered))
        active.set(binding.id, existing)
      else
        log.warn(`Failed to restore main-owned shortcut "${binding.id}" after rebinding failure`)
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.Conflict }
    }

    if (!globalShortcut.register(electronAccelerator, onTriggered))
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.Conflict }

    if (existing)
      releaseEntry(binding.id, existing)
    active.set(binding.id, nextEntry)
    return { id: binding.id, ok: true }
  }

  function releaseEntry(id: string, entry: ActiveBinding): void {
    if (entry.driver === 'electron') {
      try {
        globalShortcut.unregister(entry.electronAccelerator)
      }
      catch (error) {
        log.withError(error).warn(`Failed to unregister accelerator for "${id}"`)
      }
    }
    else {
      uiohookDriver.unregisterById(id)
    }
    active.delete(id)
  }

  function tryRegister(binding: ShortcutBinding): ShortcutRegistrationResult {
    if (active.has(binding.id)) {
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.DuplicateId }
    }

    return binding.receiveKeyUps
      ? tryRegisterUiohook(binding)
      : tryRegisterElectron(binding)
  }

  function unregisterById(id: string): void {
    const entry = active.get(id)
    if (!entry || entry.owner === 'main')
      return

    releaseEntry(id, entry)
  }

  // Renderer resets must not drop main-owned shortcuts such as Spotlight.
  function unregisterAll(includeMainOwned = false): void {
    for (const [id, entry] of active) {
      if (!includeMainOwned && entry.owner === 'main')
        continue
      releaseEntry(id, entry)
    }
  }

  const registerWindow: GlobalShortcutService['registerWindow'] = ({ context, window }) => {
    contexts.add(context)
    window.on('closed', () => {
      contexts.delete(context)
    })

    defineInvokeHandler(context, electronShortcutRegister, (binding) => {
      if (!binding.id) {
        throw new TypeError('electronShortcutRegister called with invalid binding payload')
      }
      return tryRegister(binding)
    })

    defineInvokeHandler(context, electronShortcutUnregister, (payload) => {
      if (!payload.id)
        return
      unregisterById(payload.id)
    })

    defineInvokeHandler(context, electronShortcutUnregisterAll, () => {
      unregisterAll()
    })

    defineInvokeHandler(context, electronShortcutList, () => {
      return Array.from(active.values(), entry => entry.binding)
    })
  }

  const dispose: GlobalShortcutService['dispose'] = () => {
    unregisterAll(true)
    uiohookDriver.dispose()
    contexts.clear()
  }

  onAppBeforeQuit(() => dispose())

  return { registerWindow, registerMainShortcut, dispose }
}
