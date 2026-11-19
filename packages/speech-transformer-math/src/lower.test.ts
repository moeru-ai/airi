import { headOf } from '@proj-airi/mathjson'
import { describe, expect, it } from 'vitest'

import { lowerMath } from './lower'
import { parseMath } from './parse'

const lower = (tex: string) => lowerMath(parseMath(tex))

describe('lowerMath', () => {
  it('lowers relations, operators, and juxtaposition, with multiplication first', () => {
    expect(lower('a+b c=d')).toEqual(['Equal', ['Add', 'a', ['InvisibleOperator', 'b', 'c']], 'd'])
    expect(lower(String.raw`a+b\times c`)).toEqual(['Add', 'a', ['Multiply', 'b', 'c']])
    expect(lower('-x')).toEqual(['Negate', 'x'])
    expect(lower(String.raw`x=\frac{-b\pm 1}{2a}`)).toEqual(['Equal', 'x', ['Divide', ['PlusMinus', ['Negate', 'b'], { num: '1' }], ['InvisibleOperator', { num: '2' }, 'a']]])
  })

  it('keeps what the writer wrote: percent, scientific notation, and names of geometry', () => {
    expect(lower(String.raw`50\%`)).toEqual(['Percent', { num: '50' }])
    expect(lower(String.raw`3\times10^{8}`)).toEqual(['Multiply', { num: '3' }, ['Power', { num: '10' }, { num: '8' }]])
    expect(lower(String.raw`AB \perp CD`)).toEqual(['Perpendicular', ['Name', 'A', 'B'], ['Name', 'C', 'D']])
    expect(lower(String.raw`\overline{AB}`)).toEqual(['Segment', 'A', 'B'])
  })

  it('lowers the meaning of derivatives, one-sided limits, and big operators', () => {
    expect(lower(String.raw`\frac{d}{dx}x^n`)).toEqual(['D', ['Power', 'x', 'n'], 'x'])
    expect(lower(String.raw`\lim_{x \to 0^{+}} f`)).toEqual(['Limit', 'f', ['Bounds', 'x', { num: '0' }, { num: '1' }]])
    expect(lower(String.raw`\sum_{k=1}^{n} k`)).toEqual(['Sum', 'k', ['Bounds', 'k', { num: '1' }, 'n']])
    expect(lower(String.raw`\int_0^1 x`)).toEqual(['Integrate', 'x', ['Bounds', 'Nothing', { num: '0' }, { num: '1' }]])
  })

  it('lowers delimiters by their role', () => {
    expect(lower(String.raw`x \in (0, 1]`)).toEqual(['Element', 'x', ['Interval', ['Open', { num: '0' }], { num: '1' }]])
    // A pair after a name is the arguments of a call, not an interval and not a product.
    expect(lower('P(1, 2)')).toEqual(['Apply', 'P', { num: '1' }, { num: '2' }])
    expect(lower('n(n+1)')).toEqual(['InvisibleOperator', 'n', ['Group', ['Add', 'n', { num: '1' }]]])
    expect(lower(String.raw`\{x \mid x > 0\}`)).toEqual(['Set', 'x', ['Condition', ['Greater', 'x', { num: '0' }]]])
  })

  it('lowers a letter before parentheses as a call or as a product', () => {
    // No operator inside: a call. A writer multiplies two letters as `xt`, not `x(t)`.
    expect(lower('x(t)')).toEqual(['Apply', 'x', 't'])
    // A comma: the arguments of a call, because a product has no comma.
    expect(lower('H_k(M, M-N)')).toEqual(['Apply', ['Subscript', 'H', 'k'], 'M', ['Subtract', 'M', 'N']])
    // An operator inside: a call after a decorated name or a function letter, a product after other letters.
    expect(lower('H_1(S-P)')).toEqual(['Apply', ['Subscript', 'H', { num: '1' }], ['Subtract', 'S', 'P']])
    expect(lower('f(x+1)')).toEqual(['Apply', 'f', ['Add', 'x', { num: '1' }]])
    expect(lower('a(b+c)')).toEqual(['InvisibleOperator', 'a', ['Group', ['Add', 'b', 'c']]])
    // A number power is a power, so the parentheses multiply.
    expect(lower('x^2(x+1)')).toEqual(['InvisibleOperator', ['Power', 'x', { num: '2' }], ['Group', ['Add', 'x', { num: '1' }]]])
    // e is a constant, never a function.
    expect(lower(String.raw`e^{x}(1+x)`)).toEqual(['InvisibleOperator', ['Power', 'e', 'x'], ['Group', ['Add', { num: '1' }, 'x']]])
    // The last capital of a geometry name is not a function.
    expect(lower('AB(x)')).toEqual(['InvisibleOperator', ['Name', 'A', 'B'], ['Delimiter', 'x']])
    // A centered dot alone is an empty slot, and scripts after the parentheses apply to the call.
    expect(lower(String.raw`p(\cdot)`)).toEqual(['Apply', 'p', ['Placeholder']])
    expect(lower('f(x)^2')).toEqual(['Power', ['Apply', 'f', 'x'], { num: '2' }])
    expect(lower(String.raw`\bar{x}(t)`)).toEqual(['Apply', ['Accent', '\'bar\'', 'x'], 't'])
  })

  it('reads an arrow between structures as a map and an arrow toward a value as a limit', () => {
    expect(lower(String.raw`n \to \infty`)).toEqual(['To', 'n', '\\infty'])
    expect(lower(String.raw`f(x) \to L`)).toEqual(['To', ['Apply', 'f', 'x'], 'L'])
    expect(lower(String.raw`X \to Y`)).toEqual(['Arrow', 'X', 'Y'])
    expect(lower(String.raw`H_k(M) \to H_{k-1}(M)`)).toEqual(['Arrow', ['Apply', ['Subscript', 'H', 'k'], 'M'], ['Apply', ['Subscript', 'H', ['Subtract', 'k', { num: '1' }]], 'M']])
  })

  it('keeps the colon of \\colon, so a signature reads as one', () => {
    // KaTeX expands `\colon` to `{:}` between kerns.
    expect(lower(String.raw`p \colon X \to Y`)).toEqual(['Mapping', 'p', 'X', 'Y'])
  })

  it('reads square brackets around one item', () => {
    expect(lower('[M]_x')).toEqual(['Subscript', ['Bracket', 'M'], 'x'])
    expect(lower('p([M])')).toEqual(['Apply', 'p', ['Bracket', 'M']])
  })

  it('lowers expectations, norms, and distributions', () => {
    // The brackets after the expectation hold its argument, and its subscript holds the distributions.
    expect(lower(String.raw`\mathbb{E}_{x \sim p}[f(x)]`)).toEqual(['Expectation', ['Apply', 'f', 'x'], ['Distributed', 'x', 'p']])
    // Without brackets, the expectation takes the rest of the operand, as a sum does.
    expect(lower(String.raw`\mathbb{E}_{t} \|v\|^2`)).toEqual(['Expectation', ['Power', ['Norm', 'v'], { num: '2' }], 't'])
    expect(lower(String.raw`\operatorname{Var}(X)`)).toEqual(['Variance', 'X'])
    expect(lower(String.raw`\lVert x \rVert_2`)).toEqual(['Norm', 'x', { num: '2' }])
    // A calligraphic name before brackets is a distribution on an interval.
    expect(lower(String.raw`t \sim \mathcal{U}[0,1]`)).toEqual(['Distributed', 't', ['Apply', ['Accent', '\'mathcal\'', 'U'], ['Interval', { num: '0' }, { num: '1' }]]])
    // Between two figures, `\sim` keeps its meaning of similarity.
    expect(headOf(lower(String.raw`\triangle ABC \sim \triangle DEF`))).toBe('Similar')
  })

  it('lowers a comma list as a sequence', () => {
    expect(lower(String.raw`r, s \in \Sigma`)).toEqual(['Element', ['Sequence', 'r', 's'], '\\Sigma'])
    // The split comes first, so the minus is the sign of the second item.
    expect(lower('(0, -1)')).toEqual(['Tuple', { num: '0' }, ['Negate', { num: '1' }]])
    expect(lower(String.raw`\{a, b\}`)).toEqual(['Set', ['Sequence', 'a', 'b']])
  })

  it('lowers a sign or a label in a superscript as a mark, not a power', () => {
    // A sign on a number set names a set of its own, as the positive integers.
    expect(lower(String.raw`\mathbb{N}^{+}`)).toEqual(['NumberSet', 'N+'])
    expect(lower('x^*')).toEqual(['Superscript', 'x', '\\ast'])
    expect(lower('f^{(n)}')).toEqual(['Superscript', 'f', ['Delimiter', 'n']])
  })

  it('lowers a function signature and comma-separated statements', () => {
    expect(lower(String.raw`f: X \to Y, x \mapsto y`)).toEqual(['Clauses', ['Mapping', 'f', 'X', 'Y'], ['MapsTo', 'x', 'y']])
  })

  it('lowers units and temperatures', () => {
    expect(lower(String.raw`9.8\,\mathrm{m/s^2}`)).toEqual(['InvisibleOperator', { num: '9.8' }, ['Unit', '\'m\'', '\'s\'', { num: '2' }]])
    expect(lower(String.raw`25^\circ\mathrm{C}`)).toEqual(['Celsius', { num: '25' }])
  })
})
