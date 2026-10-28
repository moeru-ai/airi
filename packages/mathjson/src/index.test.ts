import { describe, expect, it } from 'vitest'

import { isText, text, textOf } from './index'

describe('mathjson text()', () => {
  it('quotes plain strings with apostrophes', () => {
    expect(text('card')).toBe("'card'")
    expect(isText(text('card'))).toBe(true)
    expect(textOf(text('card'))).toBe('card')
  })

  it('escapes embedded apostrophes', () => {
    expect(text("it's")).toBe("'it\\'s'")
    expect(textOf(text("it's"))).toBe("it's")
  })

  it('escapes multiple apostrophes', () => {
    expect(text("a'b'c")).toBe("'a\\'b\\'c'")
    expect(textOf(text("a'b'c"))).toBe("a'b'c")
  })

  it('escapes backslashes and round-trips mixed content', () => {
    expect(text('a\\b')).toBe("'a\\\\b'")
    expect(textOf(text('a\\b'))).toBe('a\\b')

    const mixed = "it\\'s"
    expect(textOf(text(mixed))).toBe(mixed)
  })

  it('returns empty from textOf for non-text values', () => {
    expect(textOf('x')).toBe('')
    expect(textOf({ num: '1' })).toBe('')
    expect(textOf(['Add', { num: '1' }, { num: '2' }])).toBe('')
  })
})
