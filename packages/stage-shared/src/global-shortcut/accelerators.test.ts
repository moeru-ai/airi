import { describe, expect, it } from 'vitest'

import {
  formatAccelerator,
  formatElectronAccelerator,
  isValidAccelerator,
  KEY_NAMES,
  parseAccelerator,
} from './accelerators'

describe('parseAccelerator', () => {
  it('parses a single key with no modifiers', () => {
    // @example "Escape" — bare key, valid on its own
    expect(parseAccelerator('Escape')).toEqual({ modifiers: [], key: 'Escape' })
  })

  it('parses a typical accelerator with modifiers', () => {
    // @example "Mod+Shift+K" — common Cmd/Ctrl shortcut
    expect(parseAccelerator('Mod+Shift+K'))
      .toEqual({ modifiers: ['cmd-or-ctrl', 'shift'], key: 'KeyK' })
  })

  it('treats Mod, CmdOrCtrl, and CommandOrControl as the same modifier', () => {
    const a = parseAccelerator('Mod+K')
    const b = parseAccelerator('CmdOrCtrl+K')
    const c = parseAccelerator('CommandOrControl+K')
    expect(a).toEqual(b)
    expect(b).toEqual(c)
    expect(a.modifiers).toEqual(['cmd-or-ctrl'])
  })

  it('treats Cmd and Command as the same modifier', () => {
    expect(parseAccelerator('Cmd+K')).toEqual(parseAccelerator('Command+K'))
    expect(parseAccelerator('Cmd+K').modifiers).toEqual(['cmd'])
  })

  it('treats Ctrl and Control as the same modifier', () => {
    expect(parseAccelerator('Ctrl+K')).toEqual(parseAccelerator('Control+K'))
    expect(parseAccelerator('Ctrl+K').modifiers).toEqual(['ctrl'])
  })

  it('treats Alt and Option as the same modifier', () => {
    expect(parseAccelerator('Alt+F12')).toEqual(parseAccelerator('Option+F12'))
    expect(parseAccelerator('Alt+F12').modifiers).toEqual(['alt'])
  })

  it('is case-insensitive on modifier tokens', () => {
    // @example "mod+shift+k" parses identically to "Mod+Shift+K"
    expect(parseAccelerator('mod+shift+k'))
      .toEqual(parseAccelerator('Mod+Shift+K'))
  })

  it('expands single-letter shorthand to W3C key code', () => {
    // @example "K" -> "KeyK"
    expect(parseAccelerator('K').key).toBe('KeyK')
    expect(parseAccelerator('a').key).toBe('KeyA')
  })

  it('expands single-digit shorthand to W3C key code', () => {
    // @example "1" -> "Digit1"
    expect(parseAccelerator('1').key).toBe('Digit1')
    expect(parseAccelerator('Mod+9').key).toBe('Digit9')
  })

  it('accepts canonical W3C key codes verbatim', () => {
    expect(parseAccelerator('KeyK').key).toBe('KeyK')
    expect(parseAccelerator('Digit1').key).toBe('Digit1')
    expect(parseAccelerator('F12').key).toBe('F12')
    expect(parseAccelerator('ArrowUp').key).toBe('ArrowUp')
  })

  it('expands key shorthand aliases to canonical names', () => {
    // @example "Up" -> "ArrowUp", "Esc" -> "Escape"
    expect(parseAccelerator('Up').key).toBe('ArrowUp')
    expect(parseAccelerator('Esc').key).toBe('Escape')
    expect(parseAccelerator('Return').key).toBe('Enter')
  })

  it('tolerates whitespace around tokens', () => {
    expect(parseAccelerator(' Mod + Shift + K '))
      .toEqual(parseAccelerator('Mod+Shift+K'))
  })

  it('throws on empty input', () => {
    expect(() => parseAccelerator('')).toThrow(/empty string/)
    expect(() => parseAccelerator('   ')).toThrow(/empty string/)
  })

  it('throws on empty token (trailing or leading +)', () => {
    expect(() => parseAccelerator('Mod+')).toThrow(/empty token/)
    expect(() => parseAccelerator('+K')).toThrow(/empty token/)
    expect(() => parseAccelerator('Mod++K')).toThrow(/empty token/)
  })

  it('throws when the input has no key token', () => {
    expect(() => parseAccelerator('Mod+Shift')).toThrow(/no key token/)
  })

  it('throws when the input has multiple non-modifier tokens', () => {
    expect(() => parseAccelerator('Mod+K+L')).toThrow(/multiple non-modifier keys/)
  })

  it('throws on duplicate modifier (alias-aware)', () => {
    // @example "Mod+CmdOrCtrl+K" — both alias to "cmd-or-ctrl"
    expect(() => parseAccelerator('Mod+CmdOrCtrl+K'))
      .toThrow(/duplicate modifier/)
    expect(() => parseAccelerator('Shift+Shift+K'))
      .toThrow(/duplicate modifier/)
  })

  it('throws on unknown key token', () => {
    // @example "Mod+Foo" — "Foo" is not a known key
    expect(() => parseAccelerator('Mod+Foo'))
      .toThrow(/unknown key/)
  })
})

describe('isValidAccelerator', () => {
  it('returns true for well-formed accelerators', () => {
    expect(isValidAccelerator('Mod+Shift+K')).toBe(true)
    expect(isValidAccelerator(' CmdOrCtrl + K ')).toBe(true)
    expect(isValidAccelerator('Escape')).toBe(true)
  })

  it('returns false for malformed input without throwing', () => {
    expect(isValidAccelerator('')).toBe(false)
    expect(isValidAccelerator('Mod+')).toBe(false)
    expect(isValidAccelerator('Mod+Shift')).toBe(false)
    expect(isValidAccelerator('Mod+K+L')).toBe(false)
    expect(isValidAccelerator('Mod+Foo')).toBe(false)
  })
})

describe('formatAccelerator', () => {
  it('emits canonical IR with modifier ordering normalized', () => {
    // @example modifiers given in author order ['shift', 'cmd-or-ctrl']
    // serialize as 'Mod+Shift+KeyK', not 'Shift+Mod+KeyK'
    expect(formatAccelerator({ modifiers: ['shift', 'cmd-or-ctrl'], key: 'KeyK' }))
      .toBe('Mod+Shift+KeyK')
  })

  it('emits a bare key when there are no modifiers', () => {
    expect(formatAccelerator({ modifiers: [], key: 'Escape' })).toBe('Escape')
  })

  it('orders modifiers as cmd-or-ctrl, cmd, ctrl, alt, shift, super', () => {
    expect(formatAccelerator({
      modifiers: ['super', 'shift', 'alt', 'ctrl', 'cmd', 'cmd-or-ctrl'],
      key: 'KeyK',
    })).toBe('Mod+Cmd+Ctrl+Alt+Shift+Super+KeyK')
  })
})

describe('formatElectronAccelerator', () => {
  it('rewrites cmd-or-ctrl to CmdOrCtrl', () => {
    expect(formatElectronAccelerator({ modifiers: ['cmd-or-ctrl', 'shift'], key: 'KeyK' }))
      .toBe('CmdOrCtrl+Shift+K')
  })

  it('strips the Key prefix from letter keys', () => {
    // @example "KeyK" -> "K"
    expect(formatElectronAccelerator({ modifiers: ['alt'], key: 'KeyA' }))
      .toBe('Alt+A')
  })

  it('strips the Digit prefix from digit keys', () => {
    // @example "Digit1" -> "1"
    expect(formatElectronAccelerator({ modifiers: ['cmd-or-ctrl'], key: 'Digit1' }))
      .toBe('CmdOrCtrl+1')
  })

  it('rewrites arrow keys to Electron short names', () => {
    expect(formatElectronAccelerator({ modifiers: [], key: 'ArrowUp' })).toBe('Up')
    expect(formatElectronAccelerator({ modifiers: [], key: 'ArrowDown' })).toBe('Down')
  })

  it('rewrites Escape to Esc', () => {
    expect(formatElectronAccelerator({ modifiers: [], key: 'Escape' })).toBe('Esc')
  })

  it('rewrites punctuation keys to literal characters', () => {
    expect(formatElectronAccelerator({ modifiers: [], key: 'Equal' })).toBe('=')
    expect(formatElectronAccelerator({ modifiers: ['shift'], key: 'Slash' })).toBe('Shift+/')
  })

  it('passes function and named keys through unchanged', () => {
    expect(formatElectronAccelerator({ modifiers: ['alt'], key: 'F12' })).toBe('Alt+F12')
    expect(formatElectronAccelerator({ modifiers: [], key: 'Space' })).toBe('Space')
  })
})

describe('round-trip parse -> format', () => {
  it('is idempotent on canonical IR strings', () => {
    for (const input of [
      'Mod+Shift+KeyK',
      'Alt+F12',
      'Escape',
      'Mod+Alt+ArrowUp',
    ]) {
      expect(formatAccelerator(parseAccelerator(input))).toBe(input)
    }
  })

  it('normalizes non-canonical inputs to canonical IR', () => {
    // @example "Shift+Mod+k" normalizes to "Mod+Shift+KeyK"
    expect(formatAccelerator(parseAccelerator('Shift+Mod+k'))).toBe('Mod+Shift+KeyK')
    expect(formatAccelerator(parseAccelerator(' CmdOrCtrl + Shift + KeyK ')))
      .toBe('Mod+Shift+KeyK')
  })
})

describe('constant KEY_NAMES', () => {
  it('includes a representative subset of W3C key codes', () => {
    expect(KEY_NAMES.has('KeyA')).toBe(true)
    expect(KEY_NAMES.has('KeyZ')).toBe(true)
    expect(KEY_NAMES.has('Digit0')).toBe(true)
    expect(KEY_NAMES.has('F1')).toBe(true)
    expect(KEY_NAMES.has('F24')).toBe(true)
    expect(KEY_NAMES.has('ArrowUp')).toBe(true)
    expect(KEY_NAMES.has('Escape')).toBe(true)
    expect(KEY_NAMES.has('Space')).toBe(true)
  })

  it('does not include shorthand aliases', () => {
    // KEY_NAMES is the canonical set; shorthand resolves through the
    // parser, not the exported set.
    expect(KEY_NAMES.has('K')).toBe(false)
    expect(KEY_NAMES.has('Up')).toBe(false)
    expect(KEY_NAMES.has('Esc')).toBe(false)
  })
})
