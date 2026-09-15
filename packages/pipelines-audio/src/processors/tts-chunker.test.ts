// packages/pipelines-audio/src/processors/tts-chunker.test.ts

import { describe, expect, it } from 'vitest'

import { chunkTtsInput, isProbablyAngleTag, processNarrative } from './tts-chunker'

describe('tTS Chunker Logic Cleanup', () => {
  describe('isProbablyAngleTag Heuristics', () => {
    it('should identify narrative tags', () => {
      expect(isProbablyAngleTag(0, '<sigh>')).toBe(true)
    })

    it('should skip code patterns like generics', () => {
      expect(isProbablyAngleTag(4, 'List<String>')).toBe(false)
      expect(isProbablyAngleTag(1, 'x<y')).toBe(false)
    })
  })

  describe('processNarrative Function', () => {
    const options = { stripNarrative: true }

    it('should strip standard bracketed narrative', () => {
      expect(processNarrative('Hello [sighs] world', options)).toBe('Hello  world')
      expect(processNarrative('<<tag>>', options)).toBe('')
    })

    it('should restore stripping for CJK brackets', () => {
      expect(processNarrative('你好（叹气）世界', options)).toBe('你好世界')
      expect(processNarrative('【动作】你好', options)).toBe('你好')
    })

    it('should fix asterisk bullet leakage', () => {
      expect(processNarrative('* item 1', options)).toBe('* item 1')
      expect(processNarrative('*bold text*', options)).toBe('')
      expect(processNarrative('a*b', options)).toBe('a*b')
    })

    it('should handle complex nesting correctly', () => {
      expect(processNarrative('Normal (nested [action]) text', options)).toBe('Normal  text')
    })

    it('should handle open bracket correctly', () => {
      expect(processNarrative('Version (beta', options)).toBe('Version (beta')
    })

    it('should handle valid narrative tag', () => {
      expect(processNarrative('Hello,<laugh>', options)).toBe('Hello,')
      expect(processNarrative('Hello<laugh>', options)).toBe('Hello')
      expect(processNarrative('<laughs>Hello', options)).toBe('Hello')
      expect(processNarrative('Hello<laughs>', options)).toBe('Hello')
      expect(processNarrative('你好<laughs>', options)).toBe('你好')
      expect(processNarrative('List<T>', options)).toBe('List<T>')
    })

    it('should preserve code literals in keepNarrativeText mode', () => {
      const keepOptions = { stripNarrative: true, keepNarrativeText: true }
      expect(processNarrative('Value is List<String> [action]', keepOptions)).toContain('List<String>')
      expect(processNarrative('x < y (sigh)', keepOptions)).toContain('x < y')
      expect(processNarrative('price<limit', keepOptions)).toContain('price<limit')
    })

    it('should be case-insensitive for narrative tags', () => {
      const options = { stripNarrative: true }
      expect(processNarrative('Hello<LAUGHs>', options)).toBe('Hello')
      expect(processNarrative('abc<Action>', options)).toBe('abc')
      expect(processNarrative('List<String>', options)).toBe('List<String>')
    })
  })

  describe('isProbablyAngleTag Stream Prefix Handling', () => {
    it('should identify partial prefixes of narrative keywords', () => {
      expect(isProbablyAngleTag(5, 'hello<sm')).toBe(true)
      expect(isProbablyAngleTag(5, 'hello<la')).toBe(true) // laugh 的前缀
    })

    it('should not identify non-narrative prefixes as tags', () => {
      expect(isProbablyAngleTag(4, 'List<Str')).toBe(false)
    })
  })

  describe('edge Cases test', () => {
    it('should not treat single-letter operands as narrative prefixes', () => {
      expect(isProbablyAngleTag(1, 'a<b')).toBe(false)
      expect(isProbablyAngleTag(1, 'x<s')).toBe(false)
    })

    it('should support non-CJK Unicode letters as tag context', () => {
      expect(isProbablyAngleTag(4, 'café<laugh>')).toBe(true)
      expect(isProbablyAngleTag(6, 'привет<sigh>')).toBe(true)
    })
  })
})

describe('chunkTtsInput — space-less / combining scripts (#2366)', () => {
  async function reconstruct(input: string): Promise<string> {
    let out = ''
    for await (const chunk of chunkTtsInput(input))
      out += chunk.text
    return out
  }

  // Chunk boundaries trim surrounding whitespace, so compare with whitespace
  // removed to assert only that no *characters* were dropped.
  const stripWs = (s: string) => s.replace(/\s+/g, '')

  it('preserves Thai text with combining vowels and tone marks', async () => {
    // No spaces between words, and most syllables are multi-code-unit grapheme
    // clusters (base consonant + combining vowel/tone) — the exact case that
    // used to be dropped, corrupting the speech text.
    const input = 'ดึกป่านนี้แล้วยังจะหาเรื่องกินอีกนะคะเนี่ย'
    expect(await reconstruct(input)).toBe(input)
  })

  it('preserves Devanagari text with combining matras', async () => {
    const input = 'नमस्ते दुनिया यह एक छोटा परीक्षण है'
    expect(stripWs(await reconstruct(input))).toBe(stripWs(input))
  })

  it('does not drop characters from plain ASCII text', async () => {
    const input = 'Hello there, this is a normal English sentence.'
    expect(stripWs(await reconstruct(input))).toBe(stripWs(input))
  })

  it('treats a CRLF grapheme cluster as a hard boundary', async () => {
    // `\r\n` is a single grapheme cluster, so it hits the multi-unit branch;
    // it must still split the chunk like a lone `\n` (not be buffered inline).
    const chunks: string[] = []
    for await (const chunk of chunkTtsInput('abc\r\ndef'))
      chunks.push(chunk.text)
    expect(chunks).toEqual(['abc', 'def'])
  })
})
