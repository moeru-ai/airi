import { describe, expect, it } from 'vitest'

import { decodeZipFileName } from './decode-zip-filename'

describe('decodeZipFileName', () => {
  it('passes ASCII names through unchanged', () => {
    const bytes = new TextEncoder().encode('Sparkle.model3.json')
    expect(decodeZipFileName(bytes)).toBe('Sparkle.model3.json')
  })

  // https://github.com/moeru-ai/airi/pull/2458#discussion_r4130100113
  // ROOT CAUSE:
  // A GBK result can contain Han characters even when the bytes are valid UTF-8.
  // Prefer valid UTF-8 to keep Latin resource paths intact.
  it('keeps a valid UTF-8 Latin resource path', () => {
    const bytes = new TextEncoder().encode('textures/café.png')
    expect(decodeZipFileName(bytes)).toBe('textures/café.png')
  })

  it('keeps ambiguous valid UTF-8 bytes as UTF-8', () => {
    // GBK `一` is bytes D2 BB, which is also valid UTF-8 for `һ`.
    // The ZIP entry alone cannot identify the original encoding.
    const bytes = new Uint8Array([0xD2, 0xBB, ...new TextEncoder().encode('.exp3.json')])
    expect(decodeZipFileName(bytes)).toBe('һ.exp3.json')
  })

  it('decodes multi-character GBK names', () => {
    // GBK bytes for `高光` followed by an ASCII suffix.
    const bytes = new Uint8Array([0xB8, 0xDF, 0xB9, 0xE2, ...new TextEncoder().encode('.exp3.json')])
    expect(decodeZipFileName(bytes)).toBe('高光.exp3.json')
  })

  it('preserves UTF-8 CJK names when the ZIP entry omits the UTF-8 flag', () => {
    const bytes = new TextEncoder().encode('motions/哭哭.motion3.json')

    expect(decodeZipFileName(bytes)).toBe('motions/哭哭.motion3.json')
  })

  it('passes a string[] through unchanged (JSZip option-signature branch)', () => {
    expect(decodeZipFileName(['a', 'b', 'c'])).toBe('abc')
  })
})
