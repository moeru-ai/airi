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
  })

  describe('edge Cases (Codex Review)', () => {
    // 1. 测试嵌套括号
    it('should handle nested brackets correctly', () => {
      const input = '[laughs (quietly)] Hello'
      const result = processNarrative(input, { stripNarrative: true })
      expect(result.trim()).toBe('Hello')
    })

    // 2. 测试带标点符号的闭合
    it('should strip narrative even with trailing punctuation inside brackets', () => {
      const input = 'This is a test [note.]'
      const result = processNarrative(input, { stripNarrative: true })
      expect(result.trim()).toBe('This is a test')
    })

    // 3. 测试星号歧义 (Markdown 列表 vs 动作描写)
    it('should preserve markdown bullets but strip narrative asterisks', () => {
      const markdownInput = '* item 1'
      const narrativeInput = '*giggles* hello'

      const markdownResult = processNarrative(markdownInput, { stripNarrative: true })
      const narrativeResult = processNarrative(narrativeInput, { stripNarrative: true })

      expect(markdownResult).toBe('* item 1')
      expect(narrativeResult.trim()).toBe('hello')
    })

    // 4. 测试尖括号歧义 (数学公式 vs 剧本标签)
    it('should preserve math operators but strip narrative tags', () => {
      const mathInput = 'if 1 < 2 then success'
      const tagInput = '<sigh> okay'

      const mathResult = processNarrative(mathInput, { stripNarrative: true })
      const tagResult = processNarrative(tagInput, { stripNarrative: true })

      expect(mathResult).toBe('if 1 < 2 then success')
      expect(tagResult.trim()).toBe('okay')
    })
  })
})
