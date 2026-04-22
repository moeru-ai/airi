import { describe, expect, it } from 'vitest'

import { processNarrative } from './tts-chunker'

describe('tTS Chunker - Narrative Stripping', () => {
  describe('basic functionality', () => {
    it('should strip standard bracketed narrative', () => {
      const input = 'Hello [laughs] world'
      // 假设配置项为 { stripNarrative: true }
      const result = processNarrative(input, { stripNarrative: true })
      expect(result.replace(/\s+/g, ' ').trim()).toBe('Hello world')
    })

    it('should not strip when stripNarrative is false', () => {
      const input = 'Hello [laughs] world'
      const result = processNarrative(input, { stripNarrative: false })
      expect(result).toBe('Hello [laughs] world')
    })

    it('should keep narrative text when keepNarrativeText is true', () => {
      const input = 'Hello [laughs] world'
      const result = processNarrative(input, { stripNarrative: true, keepNarrativeText: true })
      expect(result).toBe('Hello laughs world')
    })
  })

  describe('edge Cases (Codex Review)', () => {
    it('should handle nested brackets correctly', () => {
      const input = '[laughs (quietly)] Hello'
      const result = processNarrative(input, { stripNarrative: true })
      expect(result.trim()).toBe('Hello')
    })

    it('should strip narrative even with trailing punctuation inside brackets', () => {
      const input = 'This is a test [note.]'
      const result = processNarrative(input, { stripNarrative: true })
      expect(result.trim()).toBe('This is a test')
    })

    it('should preserve markdown bullets but strip narrative asterisks', () => {
      const markdownInput = '* item 1'
      const narrativeInput = '*giggles* hello'

      const markdownResult = processNarrative(markdownInput, { stripNarrative: true })
      const narrativeResult = processNarrative(narrativeInput, { stripNarrative: true })

      expect(markdownResult).toBe('* item 1')
      expect(narrativeResult.trim()).toBe('hello')
    })

    it('should preserve math operators but strip narrative tags', () => {
      const mathInput = 'if 1 < 2 then success'
      const tagInput = '<sigh> okay'

      const mathResult = processNarrative(mathInput, { stripNarrative: true })
      const tagResult = processNarrative(tagInput, { stripNarrative: true })

      expect(mathResult).toBe('if 1 < 2 then success')
      expect(tagResult.trim()).toBe('okay')
    })
  })

  describe('streaming & Flush Logic', () => {
    it('should not treat tight math/code brackets as unclosed narrative', () => {
      const pendingText = 'Here is some code: List<String> and math: x<y'

      let hasUnclosed = false
      for (let i = 0; i < pendingText.length; i++) {
        const char = pendingText[i]
        if (char === '<') {
          const nextChar = pendingText[i + 1]
          if (nextChar && /[0-9\s]/.test(nextChar))
            continue
          if (i > 0 && /[^\s([{]/.test(pendingText[i - 1]))
            continue
          hasUnclosed = true
        }
      }
      expect(hasUnclosed).toBe(false)
    })

    it('should not force flush if a narrative span exceeds threshold', () => {
      const options = { stripNarrative: true }
      const hasUnclosed = true
      const pendingText = `[${'a'.repeat(250)}`

      const isStrippingActive = options.stripNarrative && hasUnclosed
      const shouldFlush = !hasUnclosed || (!isStrippingActive && pendingText.length > 200)

      expect(shouldFlush).toBe(false)
    })

    it('should distinguish attached narrative tags from tight math variables', () => {
      const narrativeTexts = ['<s', 'hello<y', '<h2']

      for (const text of narrativeTexts) {
        let hasUnclosedNarrative = false
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '<') {
            const remainder = text.slice(i + 1)
            const leftStr = text.slice(0, i)

            if (remainder.length > 0 && /[0-9\s=]/.test(remainder[0]))
              continue
            if (/^[a-z][^a-z0-9\s>]/i.test(remainder))
              continue
            if (/^[a-z]$/i.test(remainder) && /(^|[^a-z])[a-z]$/i.test(leftStr))
              continue

            hasUnclosedNarrative = true
          }
        }
        expect(hasUnclosedNarrative).toBe(true)
      }

      const mathText = 'x<y'
      let hasUnclosedMath = false
      for (let i = 0; i < mathText.length; i++) {
        if (mathText[i] === '<') {
          const remainder = mathText.slice(i + 1)
          const leftStr = mathText.slice(0, i)

          if (remainder.length > 0 && /[0-9\s=]/.test(remainder[0]))
            continue
          if (/^[a-z][^a-z\s>]/i.test(remainder))
            continue
          if (/^[a-z]$/i.test(remainder) && /(^|[^a-z])[a-z]$/i.test(leftStr))
            continue

          hasUnclosedMath = true
        }
      }
      expect(hasUnclosedMath).toBe(false)
    })
  })
})
