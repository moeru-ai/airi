import { describe, expect, it } from 'vitest'

import { leftoverNotation } from '.'

describe('leftoverNotation', () => {
  it('finds characters that a voice cannot read as words', () => {
    expect(leftoverNotation('9.8 m/s^2', String.raw`$9.8\,\mathrm{m/s^2}$`)).toEqual(['/', '^'])
    expect(leftoverNotation('りんごは $3、バナナは $5 です。', 'りんごは $3、バナナは $5 です。')).toEqual(['$', '$'])
  })

  it('finds a command name of the input that came through as a word, also next to CJK text', () => {
    expect(leftoverNotation('f X 趋于 Y x mapsto y', String.raw`$f: X \to Y, x \mapsto y$`)).toEqual(['mapsto'])
    expect(leftoverNotation('x mapsto是y', String.raw`$x \mapsto y$`)).toEqual(['mapsto'])
  })

  it('accepts command names that are also words of a reading', () => {
    expect(leftoverNotation('3 times 10 to the power of 8', String.raw`$3 \times 10^{8}$`)).toEqual([])
    expect(leftoverNotation('omega is not equal to Omega', String.raw`$\Omega \neq \omega$`)).toEqual([])
    expect(leftoverNotation('l 1 is parallel to l 2', String.raw`$l_1 \parallel l_2$`)).toEqual([])
  })

  it('accepts a command name that the input does not use', () => {
    expect(leftoverNotation('the vector maps to its image', '$v$')).toEqual([])
  })
})
