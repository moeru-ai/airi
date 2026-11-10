import { describe, expect, it } from 'vitest'

import { spellNumber } from './numbers'

describe('spellNumber', () => {
  it.each([
    ['0', 'zero', 'ゼロ', '영'],
    ['14', 'fourteen', 'じゅうよん', '십사'],
    ['25', 'twenty-five', 'にじゅうご', '이십오'],
    ['300', 'three hundred', 'さんびゃく', '삼백'],
    ['800', 'eight hundred', 'はっぴゃく', '팔백'],
    ['1,200', 'one thousand two hundred', 'せんにひゃく', '천이백'],
    ['3000', 'three thousand', 'さんぜん', '삼천'],
    ['10000', 'ten thousand', 'いちまん', '만'],
    ['3.14', 'three point one four', 'さんてんいちよん', '삼 점 일사'],
  ])('spells %s', (digits, en, ja, ko) => {
    expect(spellNumber(digits, 'en')).toBe(en)
    expect(spellNumber(digits, 'ja')).toBe(ja)
    expect(spellNumber(digits, 'ko')).toBe(ko)
  })

  it('reads a very long integer digit by digit, as an identifier', () => {
    expect(spellNumber('1234567890123', 'en')).toBe('one two three four five six seven eight nine zero one two three')
  })
})
