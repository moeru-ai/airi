// packages/pipelines-audio/src/processors/tts-chunker.test.ts

import { describe, expect, it } from 'vitest'

import { chunkTtsInput, isProbablyAngleTag, processNarrative } from './tts-chunker'

async function collectChunks(input: string, options?: Parameters<typeof chunkTtsInput>[1]): Promise<string[]> {
  const texts: string[] = []
  for await (const chunk of chunkTtsInput(input, options))
    texts.push(chunk.text)

  return texts
}

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

  // Regression: autoregressive local TTS (Chatterbox via devnen/Chatterbox-TTS-Server)
  // sounded crackly with silent gaps in chat because every short sentence became its
  // own low-context generation, while the settings playground (single whole-text
  // request) sounded clean.
  // https://github.com/devnen/Chatterbox-TTS-Server
  describe('mergeShortSentences for autoregressive local models', () => {
    it('by default ends a chunk on every hard sentence boundary', async () => {
      // ROOT CAUSE:
      //
      // hard punctuation always forced a yield, so two short sentences became
      // two tiny standalone generations -> crackle / silence on local models.
      const chunks = await collectChunks('Hi there. Okay then.', { boost: 0 })
      expect(chunks).toEqual(['Hi there.', 'Okay then.'])
    })

    it('coalesces short sentences until minimumWords is reached', async () => {
      // After the fix, the same short sentences merge into one generation with
      // enough context, approximating the playground's single-request quality.
      const chunks = await collectChunks('Hi there. Okay then.', { boost: 0, mergeShortSentences: true, minimumWords: 4 })
      expect(chunks).toEqual(['Hi there. Okay then.'])
    })

    it('still yields once enough context is accumulated', async () => {
      const chunks = await collectChunks(
        'One two three four five. Six seven.',
        { boost: 0, mergeShortSentences: true, minimumWords: 4, maximumWords: 100 },
      )
      expect(chunks).toEqual(['One two three four five.', 'Six seven.'])
    })

    it('flushes trailing short text at end of input', async () => {
      const chunks = await collectChunks('Hi.', { boost: 0, mergeShortSentences: true, minimumWords: 4 })
      expect(chunks).toEqual(['Hi.'])
    })
  })
})
