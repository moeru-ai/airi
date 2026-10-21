import { describe, expect, it } from 'vitest'

import { normalizeMathDelimiters } from './markdown'

describe('normalizeMathDelimiters', () => {
  it('converts the parenthesis and bracket delimiters outside code', () => {
    expect(normalizeMathDelimiters(String.raw`a \(x\) b \[y\]`)).toBe('a $x$ b $$y$$')
    expect(normalizeMathDelimiters('`\\(x\\)` and \\(x\\)')).toBe('`\\(x\\)` and $x$')
    expect(normalizeMathDelimiters('```\n\\[x\\]\n```')).toBe('```\n\\[x\\]\n```')
  })
})
