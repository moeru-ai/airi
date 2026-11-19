import { describe, expect, it } from 'vitest'

import { parseMath } from './parse'

describe('parseMath', () => {
  it('joins the digits that KaTeX splits, also when the last digit has a script', () => {
    expect(parseMath('3.14')).toEqual([{ type: 'symbol', value: '3.14' }])
    expect(parseMath('10^{8}')).toEqual([{ type: 'scripts', base: { type: 'symbol', value: '10' }, sup: [{ type: 'symbol', value: '8' }] }])
    // A point that does not sit between two digits stays a point.
    expect(parseMath('3.')).toEqual([{ type: 'symbol', value: '3' }, { type: 'symbol', value: '.' }])
  })

  it('unwraps the groups that KaTeX adds around scripts and arguments', () => {
    expect(parseMath(String.raw`\sum_{i=1}^{n}`)).toEqual([{
      type: 'scripts',
      base: { type: 'symbol', value: '\\sum' },
      sub: [{ type: 'symbol', value: 'i' }, { type: 'symbol', value: '=' }, { type: 'symbol', value: '1' }],
      sup: [{ type: 'symbol', value: 'n' }],
    }])
    expect(parseMath(String.raw`\frac{1}{x}`)).toEqual([{ type: 'command', name: 'frac', args: [[{ type: 'symbol', value: '1' }], [{ type: 'symbol', value: 'x' }]] }])
  })

  it('pairs delimiters into a fence, and moves a script of the closing delimiter onto it', () => {
    const [fence] = parseMath(String.raw`\left(a+b\right)^2`)
    expect(fence).toMatchObject({ type: 'fence', open: '(', close: ')', sup: [{ type: 'symbol', value: '2' }] })
    expect(parseMath('|x|')).toMatchObject([{ type: 'fence', open: '|', close: '|' }])
  })

  it('reads negations from the MathML branch of KaTeX', () => {
    expect(parseMath(String.raw`a \neq b`)[1]).toEqual({ type: 'symbol', value: '≠' })
    expect(parseMath(String.raw`a \notin A`)[1]).toEqual({ type: 'symbol', value: '∉' })
    expect(parseMath(String.raw`a \not\subseteq B`)[1]).toEqual({ type: 'symbol', value: '\\nsubseteq' })
  })

  it('keeps units as text, and lifts the raw commands of extensions out of KaTeX', () => {
    expect(parseMath(String.raw`9.8\,\mathrm{m/s^2}`)).toEqual([{ type: 'symbol', value: '9.8' }, { type: 'text', name: 'mathrm', value: 'm/s^2' }])
    expect(parseMath(String.raw`\ce{2H2 + O2 -> 2H2O}`, ['ce'])).toEqual([{ type: 'raw', command: 'ce', value: '2H2 + O2 -> 2H2O' }])
  })

  it('balances braces, and keeps the source of a formula that KaTeX cannot parse', () => {
    expect(parseMath(String.raw`\frac{1}{`)).toEqual([{ type: 'command', name: 'frac', args: [[{ type: 'symbol', value: '1' }], []] }])
    expect(parseMath('}{')).toEqual([{ type: 'group', children: [] }])
    expect(parseMath(String.raw`\left( x`)).toEqual([{ type: 'text', name: 'text', value: 'left( x' }])
  })
})
