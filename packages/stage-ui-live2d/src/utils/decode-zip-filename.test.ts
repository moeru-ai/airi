import { describe, expect, it } from 'vitest'

import { decodeZipFileName } from './decode-zip-filename'

describe('decodeZipFileName', () => {
  it('passes ASCII names through unchanged', () => {
    const bytes = new TextEncoder().encode('Sparkle.model3.json')
    expect(decodeZipFileName(bytes)).toBe('Sparkle.model3.json')
  })

  it('decodes GBK names as GBK even when the bytes are also valid UTF-8', () => {
    // GBK `一` is bytes D2 BB, which is *also* a well-formed UTF-8 sequence for `һ`.
    // Preferring valid UTF-8 here would yield mojibake; the decoder must choose GBK.
    const bytes = new Uint8Array([0xD2, 0xBB, ...new TextEncoder().encode('.exp3.json')])
    expect(decodeZipFileName(bytes)).toBe('一.exp3.json')
  })

  it('decodes multi-character GBK names', () => {
    // GBK bytes for `高光` followed by an ASCII suffix.
    const bytes = new Uint8Array([0xB8, 0xDF, 0xB9, 0xE2, ...new TextEncoder().encode('.exp3.json')])
    expect(decodeZipFileName(bytes)).toBe('高光.exp3.json')
  })

  it('passes a string[] through unchanged (JSZip option-signature branch)', () => {
    expect(decodeZipFileName(['a', 'b', 'c'])).toBe('abc')
  })
})
