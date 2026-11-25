import { describe, expect, it } from 'vitest'

import { gradeEmotion, gradeSpoken } from '.'

describe('gradeSpoken', () => {
  it('ignores whitespace and the width of punctuation, and keeps every other character', () => {
    expect(gradeSpoken('Aww that sounds rough.', 'Aww  that\nsounds rough.')).toBe(1)
    expect(gradeSpoken('明天见（其实我也不确定几点）', '明天见(其实我也不确定几点)')).toBe(1)
    expect(gradeSpoken('Aww that sounds rough.', 'Aww : that sounds rough.')).toBe(0)
    expect(gradeSpoken('明天见（其实我也不确定几点）', '明天见')).toBe(0)
  })
})

describe('gradeEmotion', () => {
  it('needs the named emotion, no emotion for none, and accepts anything for any', () => {
    expect(gradeEmotion('sad', ['sad'])).toBe(1)
    expect(gradeEmotion('sad', [])).toBe(0)
    expect(gradeEmotion('sad', ['sad', 'happy'])).toBe(0)
    expect(gradeEmotion('none', [])).toBe(1)
    expect(gradeEmotion('none', ['happy'])).toBe(0)
    expect(gradeEmotion('any', ['happy'])).toBe(1)
    expect(gradeEmotion('any', [])).toBe(1)
  })
})
