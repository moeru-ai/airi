import { describe, expect, it } from 'vitest'

import { isProbablyAngleTag, processNarrative } from './tts-chunker'

describe('angle Bracket Heuristics (Gemini Fix)', () => {
  it('should identify real narrative tags', () => {
    expect(isProbablyAngleTag(0, '<sigh>')).toBe(true)
    expect(isProbablyAngleTag(1, ' <laughs>')).toBe(true)
  })

  it('should skip code and math patterns', () => {
    expect(isProbablyAngleTag(4, 'List<String>')).toBe(false) // 泛型测试
    expect(isProbablyAngleTag(1, 'x<y')).toBe(false) // 紧凑数学测试
    expect(isProbablyAngleTag(2, '1 < 2')).toBe(false) // 带空格数学测试
  })

  it('should not leak generic types in output', () => {
    const input = 'Check out List<String> please.'
    const result = processNarrative(input, { stripNarrative: true })
    expect(result).toContain('List<String>')
  })
})
