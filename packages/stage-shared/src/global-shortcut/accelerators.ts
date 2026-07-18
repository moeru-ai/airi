import type { ShortcutAccelerator, ShortcutKey, ShortcutModifier } from './types'

/**
 * Accelerator parsing, validation, and serialization.
 *
 * The canonical form is the structured `ShortcutAccelerator`. Strings
 * are an ergonomic input/output format only.
 *
 * Two output flavours are provided:
 * - `formatAccelerator`         — canonical string form
 *                                 (`"Mod+Shift+KeyK"`); round-trips
 *                                 losslessly through `parseAccelerator`.
 * - `formatElectronAccelerator` — Electron's accelerator string
 *                                 (`"CmdOrCtrl+Shift+K"`), suitable for
 *                                 passing directly to
 *                                 `globalShortcut.register`.
 *
 * Future C# drivers consume the structured value and never call into
 * these utilities; they exist only at the renderer/config-author edges.
 */

const LETTER_KEYS: ReadonlySet<ShortcutKey> = new Set([
  'KeyA',
  'KeyB',
  'KeyC',
  'KeyD',
  'KeyE',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyI',
  'KeyJ',
  'KeyK',
  'KeyL',
  'KeyM',
  'KeyN',
  'KeyO',
  'KeyP',
  'KeyQ',
  'KeyR',
  'KeyS',
  'KeyT',
  'KeyU',
  'KeyV',
  'KeyW',
  'KeyX',
  'KeyY',
  'KeyZ',
])

const DIGIT_KEYS: ReadonlySet<ShortcutKey> = new Set([
  'Digit0',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
])

const FUNCTION_KEYS: ReadonlySet<ShortcutKey> = new Set([
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'F13',
  'F14',
  'F15',
  'F16',
  'F17',
  'F18',
  'F19',
  'F20',
  'F21',
  'F22',
  'F23',
  'F24',
])

const NAMED_KEYS: ReadonlySet<ShortcutKey> = new Set([
  'Space',
  'Tab',
  'Enter',
  'Escape',
  'Backspace',
  'Delete',
  'Insert',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Backquote',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Comma',
  'Period',
  'Slash',
])

/**
 * Full set of accepted W3C `KeyboardEvent.code` key names. Drivers map
 * each value to the native key code understood by their platform API.
 */
export const KEY_NAMES: ReadonlySet<ShortcutKey> = new Set<ShortcutKey>([
  ...LETTER_KEYS,
  ...DIGIT_KEYS,
  ...FUNCTION_KEYS,
  ...NAMED_KEYS,
])

/**
 * Shorthand-to-canonical key alias map used by the parser.
 *
 * Lets authors write `Up` instead of `ArrowUp`, `Esc` instead of
 * `Escape`, etc. Single letters and digits are handled by inline
 * regex fallbacks rather than entries here, so `K` becomes `KeyK`
 * and `1` becomes `Digit1` without lookup.
 */
const KEY_ALIASES: ReadonlyMap<string, ShortcutKey> = new Map([
  ['Up', 'ArrowUp'],
  ['Down', 'ArrowDown'],
  ['Left', 'ArrowLeft'],
  ['Right', 'ArrowRight'],
  ['Esc', 'Escape'],
  ['Return', 'Enter'],
  ['Spacebar', 'Space'],
])

/**
 * Modifier alias map (case-insensitive lookup; keys are lowercase).
 *
 * Accepts the union of names used by Electron, Tauri, and informal
 * style so authors can paste from existing docs without translation.
 */
const MODIFIER_ALIASES: ReadonlyMap<string, ShortcutModifier> = new Map<string, ShortcutModifier>([
  ['mod', 'cmd-or-ctrl'],
  ['cmdorctrl', 'cmd-or-ctrl'],
  ['commandorcontrol', 'cmd-or-ctrl'],
  ['cmd', 'cmd'],
  ['command', 'cmd'],
  ['ctrl', 'ctrl'],
  ['control', 'ctrl'],
  ['alt', 'alt'],
  ['option', 'alt'],
  ['shift', 'shift'],
  ['super', 'super'],
])

/**
 * Canonical modifier order used when serializing back to a string.
 * Two structurally identical accelerators always serialize to the
 * same string regardless of the order in which the author wrote
 * modifiers.
 */
const MODIFIER_CANONICAL_ORDER: readonly ShortcutModifier[] = [
  'cmd-or-ctrl',
  'cmd',
  'ctrl',
  'alt',
  'shift',
  'super',
]

/**
 * Title-case modifier tokens used by `formatAccelerator` (canonical
 * string output). Mirrors Tauri/Electron casing so output is
 * recognizable.
 */
const MODIFIER_TO_CANONICAL_TOKEN: Readonly<Record<ShortcutModifier, string>> = {
  'cmd-or-ctrl': 'Mod',
  'cmd': 'Cmd',
  'ctrl': 'Ctrl',
  'alt': 'Alt',
  'shift': 'Shift',
  'super': 'Super',
}

/**
 * Tokens used by `formatElectronAccelerator`. `cmd-or-ctrl` becomes
 * `CmdOrCtrl`; everything else passes through unchanged.
 */
const MODIFIER_TO_ELECTRON_TOKEN: Readonly<Record<ShortcutModifier, string>> = {
  'cmd-or-ctrl': 'CmdOrCtrl',
  'cmd': 'Cmd',
  'ctrl': 'Ctrl',
  'alt': 'Alt',
  'shift': 'Shift',
  'super': 'Super',
}

/**
 * Per-key overrides used when serializing for Electron. Electron's
 * accelerator format expects literal characters or short names for
 * many keys (`Up`, `Esc`, `=`, etc.) rather than the W3C codes.
 *
 * Letter and digit keys are handled by stripping the `Key`/`Digit`
 * prefix in `toElectronKey`, so they are not listed here.
 */
const ELECTRON_KEY_OVERRIDES: Readonly<Record<string, string>> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
}

const SINGLE_LETTER_RE = /^[A-Z]$/i
const SINGLE_DIGIT_RE = /^\d$/

/**
 * Normalizes a raw key token to a canonical `ShortcutKey`.
 *
 * Before:
 * - `"K"` / `"k"` / `"KeyK"` / `"Up"` / `"Esc"`
 *
 * After:
 * - `"KeyK"` / `"KeyK"` / `"KeyK"` / `"ArrowUp"` / `"Escape"`
 */
function normalizeKeyToken(token: string): ShortcutKey {
  if (KEY_NAMES.has(token))
    return token

  const aliased = KEY_ALIASES.get(token)
  if (aliased !== undefined)
    return aliased

  if (SINGLE_LETTER_RE.test(token)) {
    const candidate = `Key${token.toUpperCase()}`
    if (LETTER_KEYS.has(candidate))
      return candidate
  }

  if (SINGLE_DIGIT_RE.test(token)) {
    const candidate = `Digit${token}`
    if (DIGIT_KEYS.has(candidate))
      return candidate
  }

  throw new Error(`Invalid accelerator: unknown key "${token}"`)
}

/**
 * Returns the canonical modifier for a token, or `undefined` if the
 * token is not a modifier (i.e. probably a key).
 */
function lookupModifierToken(token: string): ShortcutModifier | undefined {
  return MODIFIER_ALIASES.get(token.toLowerCase())
}

/**
 * Parses a string accelerator into its canonical structured form.
 *
 * Use when:
 * - Accepting an accelerator from author code, settings UI, or config
 *   file
 * - Validating user input
 *
 * Expects:
 * - `input` is a `+`-joined token string. Whitespace around tokens is
 *   tolerated and ignored. Modifier tokens are case-insensitive; key
 *   tokens are matched against `KEY_NAMES` and a small alias map, with
 *   single letters and digits accepted as shorthand.
 *
 * Returns:
 * - A `ShortcutAccelerator` with modifiers in input order and a
 *   canonical key
 *
 * Throws:
 * - `Error` when the input is empty, has empty tokens, names an
 *   unknown key, repeats a modifier, or contains multiple non-modifier
 *   tokens
 *
 * @example
 *   parseAccelerator('Mod+Shift+K')
 *   // => { modifiers: ['cmd-or-ctrl', 'shift'], key: 'KeyK' }
 *
 * @example
 *   parseAccelerator(' CmdOrCtrl + Shift + KeyK ')
 *   // => same as above; whitespace tolerated
 */
export function parseAccelerator(input: string): ShortcutAccelerator {
  const trimmed = input.trim()
  if (trimmed.length === 0)
    throw new Error('Invalid accelerator: empty string')

  const rawTokens = trimmed.split('+')
  const modifiers: ShortcutModifier[] = []
  let key: ShortcutKey | undefined

  for (const raw of rawTokens) {
    const token = raw.trim()
    if (token.length === 0)
      throw new Error(`Invalid accelerator "${input}": empty token`)

    const modifier = lookupModifierToken(token)
    if (modifier !== undefined) {
      if (modifiers.includes(modifier))
        throw new Error(`Invalid accelerator "${input}": duplicate modifier "${modifier}"`)
      modifiers.push(modifier)
      continue
    }

    if (key !== undefined)
      throw new Error(`Invalid accelerator "${input}": multiple non-modifier keys ("${key}", "${token}")`)
    key = normalizeKeyToken(token)
  }

  if (key === undefined)
    throw new Error(`Invalid accelerator "${input}": no key token`)

  return { modifiers, key }
}

/**
 * Tests whether `input` is a well-formed accelerator string.
 *
 * Use when:
 * - Gating user input without needing the parsed result
 *
 * Returns:
 * - `true` when `parseAccelerator` would succeed, `false` otherwise
 */
export function isValidAccelerator(input: string): boolean {
  try {
    parseAccelerator(input)
    return true
  }
  catch {
    return false
  }
}

/**
 * Returns the modifiers of `acc` sorted into canonical order.
 */
function canonicalModifiers(acc: ShortcutAccelerator): ShortcutModifier[] {
  return MODIFIER_CANONICAL_ORDER.filter(m => acc.modifiers.includes(m))
}

/**
 * Serializes a structured accelerator back to its canonical string
 * form.
 *
 * Use when:
 * - Displaying a binding in settings UI
 * - Round-tripping a binding through a string representation
 *
 * Returns:
 * - A `+`-joined string with modifiers in canonical order followed by
 *   the key. The output round-trips losslessly through
 *   `parseAccelerator`.
 *
 * @example
 *   formatAccelerator({ modifiers: ['shift', 'cmd-or-ctrl'], key: 'KeyK' })
 *   // => 'Mod+Shift+KeyK'
 */
export function formatAccelerator(acc: ShortcutAccelerator): string {
  const tokens = canonicalModifiers(acc).map(m => MODIFIER_TO_CANONICAL_TOKEN[m])
  tokens.push(acc.key)
  return tokens.join('+')
}

/**
 * Translates a canonical W3C key name to Electron's accelerator key
 * token.
 *
 * Before:
 * - `"KeyK"` / `"Digit1"` / `"ArrowUp"` / `"Equal"` / `"F12"`
 *
 * After:
 * - `"K"` / `"1"` / `"Up"` / `"="` / `"F12"`
 */
function toElectronKey(key: ShortcutKey): string {
  if (LETTER_KEYS.has(key))
    return key.slice(3)
  if (DIGIT_KEYS.has(key))
    return key.slice(5)
  if (key in ELECTRON_KEY_OVERRIDES)
    return ELECTRON_KEY_OVERRIDES[key]
  return key
}

/**
 * Serializes a structured accelerator to Electron's accelerator string
 * format, suitable for `globalShortcut.register`.
 *
 * Use when:
 * - Calling Electron's `globalShortcut` API from the main-process
 *   driver
 *
 * Returns:
 * - An Electron-format string with modifiers in canonical order
 *   (`CmdOrCtrl`, `Cmd`, `Ctrl`, `Alt`, `Shift`, `Super`) followed by
 *   Electron's key spelling
 *
 * @example
 *   formatElectronAccelerator({ modifiers: ['cmd-or-ctrl', 'shift'], key: 'KeyK' })
 *   // => 'CmdOrCtrl+Shift+K'
 */
export function formatElectronAccelerator(acc: ShortcutAccelerator): string {
  const tokens = canonicalModifiers(acc).map(m => MODIFIER_TO_ELECTRON_TOKEN[m])
  tokens.push(toElectronKey(acc.key))
  return tokens.join('+')
}
