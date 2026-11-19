import type { MaybeRefOrGetter } from 'vue'

import { useEventListener, useMagicKeys } from '@vueuse/core'
import { computed, toValue } from 'vue'

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
  /**
   * The name of the key in `useMagicKeys`. A modifier uses its key name, for example `control`. A main key uses its
   * lower case `KeyboardEvent.code`, for example `keyk`, so the keyboard layout does not change it.
   */
  magicKey: string
}

const appleModifiers: Record<string, { symbol: string, name: string, magicKey: string }> = {
  Ctrl: { symbol: '⌃', name: 'control', magicKey: 'control' },
  Shift: { symbol: '⇧', name: 'shift', magicKey: 'shift' },
  Alt: { symbol: '⌥', name: 'option', magicKey: 'alt' },
  Cmd: { symbol: '⌘', name: 'command', magicKey: 'meta' },
  Mod: { symbol: '⌘', name: 'command', magicKey: 'meta' },
}

const otherModifiers: Record<string, { name: string, magicKey: string }> = {
  Ctrl: { name: 'Ctrl', magicKey: 'control' },
  Shift: { name: 'Shift', magicKey: 'shift' },
  Alt: { name: 'Alt', magicKey: 'alt' },
  Super: { name: 'Win', magicKey: 'meta' },
  Mod: { name: 'Ctrl', magicKey: 'control' },
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
 * // => { token: 'Ctrl', symbol: '⌃', name: 'control', wide: false, magicKey: 'control' }
 * describeShortcutKey('K', false)
 * // => { token: 'K', name: 'K', wide: false, magicKey: 'keyk' }
 */
export function describeShortcutKey(token: string, isApple: boolean): ShortcutKeycap {
  const modifier = isApple ? appleModifiers[token] : otherModifiers[token]
  if (modifier)
    return { token, symbol: isApple ? appleModifiers[token]?.symbol : undefined, name: modifier.name, wide: false, magicKey: modifier.magicKey }

  const code = /^[A-Z]$/.test(token) ? `Key${token}` : /^\d$/.test(token) ? `Digit${token}` : token
  return {
    token,
    symbol: isApple ? appleKeySymbols[token] : undefined,
    name: token === 'Space' && isApple ? 'space' : token,
    wide: token === 'Space',
    magicKey: code.toLowerCase(),
  }
}

/**
 * Follows which keys of a shortcut the user holds in this window, so each keycap can move with its key.
 *
 * It reads the key events of this window only, through `useMagicKeys`. A global hook reports presses in other apps,
 * see `tryShortcut`.
 */
export function useShortcutKeys(tokens: MaybeRefOrGetter<readonly string[]>) {
  const isApple = /Mac|iPhone|iPad/.test(navigator.userAgent)
  const keycaps = computed(() => toValue(tokens).map(token => describeShortcutKey(token, isApple)))

  const keys = useMagicKeys()

  /** The tokens that are held now. */
  const held = computed<ReadonlySet<string>>(() => new Set(keycaps.value.filter(keycap => keys[keycap.magicKey]?.value).map(keycap => keycap.token)))
  const allHeld = computed(() => keycaps.value.length > 0 && held.value.size === keycaps.value.length)

  // A full press is a try, so the page does not also type a space or scroll. This listener comes after the one of
  // `useMagicKeys`, so the held keys already include this event.
  useEventListener(window, 'keydown', (event) => {
    if (allHeld.value)
      event.preventDefault()
  }, { passive: false })

  return { keycaps, held, allHeld }
}
