import type { MaybeRefOrGetter } from 'vue'

import { useEventListener } from '@vueuse/core'
import { computed, shallowRef, toValue, watch } from 'vue'

type ModifierFlag = 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'

/** One key of a shortcut, as a keycap shows it. */
export interface ShortcutKeycap {
  /** The token of the shortcut, for example `Ctrl` or `Space`. */
  token: string
  /** The symbol that Apple keyboards print, for example `⌃`. Other keyboards print none. */
  symbol?: string
  /** The name on the keycap, for example `control` on Apple keyboards and `Ctrl` on others. */
  name: string
  /** True for a key that is wider than a letter key, for example Space. */
  wide: boolean
  /** The flag of a key event that shows a held modifier. */
  modifier?: ModifierFlag
  /** The `KeyboardEvent.code` of a main key. */
  code?: string
}

const appleModifiers: Record<string, { symbol: string, name: string, modifier: ModifierFlag }> = {
  Ctrl: { symbol: '⌃', name: 'control', modifier: 'ctrlKey' },
  Shift: { symbol: '⇧', name: 'shift', modifier: 'shiftKey' },
  Alt: { symbol: '⌥', name: 'option', modifier: 'altKey' },
  Cmd: { symbol: '⌘', name: 'command', modifier: 'metaKey' },
  Mod: { symbol: '⌘', name: 'command', modifier: 'metaKey' },
}

const otherModifiers: Record<string, { name: string, modifier: ModifierFlag }> = {
  Ctrl: { name: 'Ctrl', modifier: 'ctrlKey' },
  Shift: { name: 'Shift', modifier: 'shiftKey' },
  Alt: { name: 'Alt', modifier: 'altKey' },
  Super: { name: 'Win', modifier: 'metaKey' },
  Mod: { name: 'Ctrl', modifier: 'ctrlKey' },
}

const appleKeySymbols: Record<string, string> = {
  Enter: '↩',
  Tab: '⇥',
  Backspace: '⌫',
  Escape: '⎋',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

/**
 * Describes one key of a shortcut for a keycap, as the keyboard of the platform prints it.
 *
 * @example
 * describeShortcutKey('Ctrl', true)
 * // => { token: 'Ctrl', symbol: '⌃', name: 'control', wide: false, modifier: 'ctrlKey' }
 * describeShortcutKey('K', false)
 * // => { token: 'K', name: 'K', wide: false, code: 'KeyK' }
 */
export function describeShortcutKey(token: string, isApple: boolean): ShortcutKeycap {
  const modifier = isApple ? appleModifiers[token] : otherModifiers[token]
  if (modifier)
    return { token, symbol: isApple ? appleModifiers[token]?.symbol : undefined, name: modifier.name, wide: false, modifier: modifier.modifier }

  const code = /^[A-Z]$/.test(token) ? `Key${token}` : /^\d$/.test(token) ? `Digit${token}` : token
  return {
    token,
    symbol: isApple ? appleKeySymbols[token] : undefined,
    name: token === 'Space' && isApple ? 'space' : token,
    wide: token === 'Space',
    code,
  }
}

/**
 * Follows which keys of a shortcut the user holds in this window, so each keycap can move with its key.
 *
 * It reads the key events of this window only. A global hook reports presses in other apps, see `tryShortcut`.
 */
export function useShortcutKeys(tokens: MaybeRefOrGetter<readonly string[]>) {
  const isApple = /Mac|iPhone|iPad/.test(navigator.userAgent)
  const keycaps = computed(() => toValue(tokens).map(token => describeShortcutKey(token, isApple)))
  /** The tokens that are held now. */
  const held = shallowRef<ReadonlySet<string>>(new Set())

  function onKey(event: KeyboardEvent) {
    const next = new Set<string>()
    for (const keycap of keycaps.value) {
      // A modifier reads its flag on each event. A main key stays held from its keydown until its keyup.
      const isHeld = keycap.modifier
        ? event[keycap.modifier]
        : event.code === keycap.code ? event.type === 'keydown' : held.value.has(keycap.token)
      if (isHeld)
        next.add(keycap.token)
    }
    // A full press is a try, so the page does not also type a space or scroll.
    if (keycaps.value.length > 0 && next.size === keycaps.value.length)
      event.preventDefault()
    held.value = next
  }

  useEventListener(window, 'keydown', onKey)
  useEventListener(window, 'keyup', onKey)
  // A window that loses focus never sees the keyup.
  useEventListener(window, 'blur', () => held.value = new Set())
  watch(keycaps, () => held.value = new Set())

  const allHeld = computed(() => keycaps.value.length > 0 && keycaps.value.every(keycap => held.value.has(keycap.token)))

  return { keycaps, held, allHeld }
}
