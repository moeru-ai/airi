import type { useLogg } from '@guiiai/logg'
import type {
  ShortcutAccelerator,
  ShortcutBinding,
  ShortcutKey,
  ShortcutModifier,
  ShortcutRegistrationResult,
} from '@proj-airi/stage-shared/global-shortcut'
import type { UiohookKeyboardEvent } from 'uiohook-napi'

import process from 'node:process'

import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { systemPreferences } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'

type Logger = ReturnType<ReturnType<typeof useLogg>['useGlobalConfig']>

interface ModifierMask {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}

interface UiohookEntry {
  binding: ShortcutBinding
  predicate: (event: UiohookKeyboardEvent) => boolean
  expectedKeycode: number
  pressed: boolean
}

const W3C_TO_UIOHOOK: Readonly<Record<ShortcutKey, number>> = buildKeycodeMap()

function buildKeycodeMap(): Record<ShortcutKey, number> {
  const map: Record<string, number> = {}

  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i)
    map[`Key${letter}`] = (UiohookKey as unknown as Record<string, number>)[letter]
  }

  for (let i = 0; i <= 9; i++) {
    map[`Digit${i}`] = (UiohookKey as unknown as Record<string, number>)[String(i)]
  }

  for (let i = 1; i <= 24; i++) {
    map[`F${i}`] = (UiohookKey as unknown as Record<string, number>)[`F${i}`]
  }

  const named: Record<string, keyof typeof UiohookKey> = {
    Space: 'Space',
    Tab: 'Tab',
    Enter: 'Enter',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Backquote: 'Backquote',
    Minus: 'Minus',
    Equal: 'Equal',
    BracketLeft: 'BracketLeft',
    BracketRight: 'BracketRight',
    Backslash: 'Backslash',
    Semicolon: 'Semicolon',
    Quote: 'Quote',
    Comma: 'Comma',
    Period: 'Period',
    Slash: 'Slash',
  }
  for (const [w3c, uioName] of Object.entries(named))
    map[w3c] = (UiohookKey as unknown as Record<string, number>)[uioName as string]

  return map
}

function resolveModifierMask(modifiers: readonly ShortcutModifier[], platform: NodeJS.Platform): ModifierMask {
  const mask: ModifierMask = { ctrl: false, shift: false, alt: false, meta: false }
  for (const m of modifiers) {
    switch (m) {
      case 'cmd-or-ctrl':
        if (platform === 'darwin')
          mask.meta = true
        else
          mask.ctrl = true
        break
      case 'cmd':
      case 'super':
        // libuiohook surfaces macOS Cmd, Windows key, and X11 Super
        // through the same `metaKey` flag.
        mask.meta = true
        break
      case 'ctrl':
        mask.ctrl = true
        break
      case 'alt':
        mask.alt = true
        break
      case 'shift':
        mask.shift = true
        break
    }
  }
  return mask
}

function buildPredicate(acc: ShortcutAccelerator, platform: NodeJS.Platform): { predicate: UiohookEntry['predicate'], expectedKeycode: number } | undefined {
  const expectedKeycode = W3C_TO_UIOHOOK[acc.key]
  if (expectedKeycode === undefined)
    return undefined
  const required = resolveModifierMask(acc.modifiers, platform)
  const predicate: UiohookEntry['predicate'] = e =>
    e.keycode === expectedKeycode
    && e.ctrlKey === required.ctrl
    && e.shiftKey === required.shift
    && e.altKey === required.alt
    && e.metaKey === required.meta
  return { predicate, expectedKeycode }
}

function isNativeWayland(platform: NodeJS.Platform, sessionType: string | undefined): boolean {
  return platform === 'linux' && sessionType === 'wayland'
}

function isMacAccessibilityTrusted(platform: NodeJS.Platform, prompt: boolean): boolean {
  if (platform !== 'darwin')
    return true
  try {
    return systemPreferences.isTrustedAccessibilityClient(prompt)
  }
  catch {
    return true
  }
}

export interface UiohookDriverOptions {
  broadcastTriggered: (id: string, phase: 'down' | 'up') => void
  logger: Logger
  /**
   * Host platform; injected so tests can exercise cross-platform
   * modifier mapping without stubbing `process`.
   *
   * @default process.platform
   */
  platform?: NodeJS.Platform
  /**
   * `XDG_SESSION_TYPE` value used for the Wayland refusal check;
   * injected for the same reason as `platform`.
   *
   * @default process.env.XDG_SESSION_TYPE
   */
  sessionType?: string
}

export interface UiohookDriver {
  tryRegister: (binding: ShortcutBinding) => ShortcutRegistrationResult
  unregisterById: (id: string) => void
  unregisterAll: () => void
  dispose: () => void
}

/**
 * Driver that captures global key-down and key-up events via
 * libuiohook (through `uiohook-napi`).
 *
 * Use when:
 * - A binding asks for `receiveKeyUps: true` (push-to-talk and similar
 *   hold-driven flows)
 *
 * Lifecycle:
 * - The OS hook starts lazily on the first successful registration and
 *   stops once the last binding is unregistered, so apps that never
 *   bind a PTT shortcut never pay the permission/perf cost.
 *
 * Constraints:
 * - macOS: requires the Accessibility permission. First registration
 *   triggers the system prompt; subsequent failures return `Denied`.
 * - Linux: requires X11 or XWayland. Native Wayland sessions return
 *   `Unsupported` because XRecord cannot observe Wayland clients.
 */
export function createUiohookDriver(options: UiohookDriverOptions): UiohookDriver {
  const {
    broadcastTriggered,
    logger,
    platform = process.platform,
    sessionType = process.env.XDG_SESSION_TYPE,
  } = options
  const entries = new Map<string, UiohookEntry>()
  let started = false
  let listenersInstalled = false

  function ensureListeners(): void {
    if (listenersInstalled)
      return
    listenersInstalled = true
    uIOhook.on('keydown', onKeydown)
    uIOhook.on('keyup', onKeyup)
  }

  function startIfNeeded(): void {
    if (started || entries.size === 0)
      return
    try {
      uIOhook.start()
      started = true
    }
    catch (error) {
      logger.withError(error).warn('Failed to start uIOhook')
    }
  }

  function stopIfIdle(): void {
    if (!started || entries.size > 0)
      return
    try {
      uIOhook.stop()
    }
    catch (error) {
      logger.withError(error).warn('Failed to stop uIOhook')
    }
    started = false
  }

  function onKeydown(event: UiohookKeyboardEvent): void {
    for (const entry of entries.values()) {
      if (!entry.predicate(event))
        continue
      // Auto-repeat suppression: OS may deliver repeated keydown
      // while the key stays physically held. Emit one `down` per
      // physical press until the matching keyup clears the flag.
      if (entry.pressed)
        continue
      entry.pressed = true
      broadcastTriggered(entry.binding.id, 'down')
    }
  }

  function onKeyup(event: UiohookKeyboardEvent): void {
    // NOTICE:
    // Match keyup by keycode alone; modifier flags may be released
    // before the main key (e.g. Cmd released before K), in which case
    // the strict predicate would not match. Pairing keyup to the
    // binding via the prior `pressed` state ensures every `down`
    // emits a matching `up`.
    for (const entry of entries.values()) {
      if (!entry.pressed)
        continue
      if (event.keycode !== entry.expectedKeycode)
        continue
      entry.pressed = false
      broadcastTriggered(entry.binding.id, 'up')
    }
  }

  function tryRegister(binding: ShortcutBinding): ShortcutRegistrationResult {
    if (entries.has(binding.id))
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.DuplicateId }

    if (isNativeWayland(platform, sessionType)) {
      // libuiohook hooks install but never receive events under
      // native Wayland. Refuse rather than register a binding that
      // would silently no-op.
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.Unsupported }
    }

    if (!isMacAccessibilityTrusted(platform, true))
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.Denied }

    const built = buildPredicate(binding.accelerator, platform)
    if (built === undefined) {
      logger.warn(`uiohook driver: no keycode mapping for "${binding.accelerator.key}"`)
      return { id: binding.id, ok: false, reason: ShortcutFailureReasons.Unsupported }
    }

    entries.set(binding.id, {
      binding,
      predicate: built.predicate,
      expectedKeycode: built.expectedKeycode,
      pressed: false,
    })
    ensureListeners()
    startIfNeeded()
    return { id: binding.id, ok: true }
  }

  function unregisterById(id: string): void {
    if (!entries.delete(id))
      return
    stopIfIdle()
  }

  function unregisterAll(): void {
    if (entries.size === 0)
      return
    entries.clear()
    stopIfIdle()
  }

  function dispose(): void {
    unregisterAll()
    if (listenersInstalled) {
      uIOhook.removeListener('keydown', onKeydown)
      uIOhook.removeListener('keyup', onKeyup)
      listenersInstalled = false
    }
  }

  return { tryRegister, unregisterById, unregisterAll, dispose }
}
