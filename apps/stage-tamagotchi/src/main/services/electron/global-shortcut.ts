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

export type EventaContext = ReturnType<typeof createContext>['context']

export interface RegisterWindowParams {
  context: EventaContext
  window: BrowserWindow
}

export interface GlobalShortcutService {
  /**
   * Register a per-window eventa context. Invoke handlers are installed
   * on the context; trigger events are broadcast to every registered
   * context, so each window's renderer receives them. Auto-removes on
   * `window.on('closed')`.
   */
  registerWindow: (params: RegisterWindowParams) => void
  dispose: () => void
}

interface ActiveBinding {
  binding: ShortcutBinding
  electronAccelerator: string
}

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

  function tryRegister(binding: ShortcutBinding): ShortcutRegistrationResult {
    if (binding.receiveKeyUps) {
      // Electron's `globalShortcut` only fires on press. A separate
      // driver path (uiohook-napi) handles `receiveKeyUps: true`;
      // this driver refuses honestly until that path is wired.
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.Unsupported }
    }

    if (active.has(binding.id)) {
      // Callers must `unregister` first to rebind. Avoids silent overrides
      // between unrelated registration sites.
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.DuplicateId }
    }

    const electronAccelerator = formatElectronAccelerator(binding.accelerator)
    const ok = globalShortcut.register(electronAccelerator, () => broadcastTriggered(binding.id, 'down'))

    if (!ok) {
      // `globalShortcut.register` returns false for several distinct
      // causes (held by another app, or denied by the OS for media
      // keys / Accessibility-gated combos on macOS). Electron does not
      // expose which case applied, so this driver reports `Conflict`
      // for both. A future driver path (XDG portal, native macOS) can
      // emit `Denied` directly.
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.Conflict }
    }

    active.set(binding.id, { binding, electronAccelerator })
    return { id: binding.id, ok: true }
  }

  function unregisterById(id: string): void {
    const entry = active.get(id)
    if (!entry)
      return
    try {
      globalShortcut.unregister(entry.electronAccelerator)
    }
    catch (error) {
      log.withError(error).warn(`Failed to unregister accelerator for "${id}"`)
    }
    active.delete(id)
  }

  function unregisterAll(): void {
    for (const [id, entry] of active) {
      try {
        globalShortcut.unregister(entry.electronAccelerator)
      }
      catch (error) {
        log.withError(error).warn(`Failed to unregister accelerator for "${id}"`)
      }
    }
    active.clear()
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
    unregisterAll()
    contexts.clear()
  }

  onAppBeforeQuit(() => dispose())

  return { registerWindow, dispose }
}
