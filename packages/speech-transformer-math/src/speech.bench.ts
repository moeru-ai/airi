import { bench, describe } from 'vitest'

import { en } from './locales/en'
import { lowerMath } from './lower'
import { parseMath } from './parse'
import { renderMath } from './render'

// Formulas of the formula speech eval, one of each stratum, with units. Chemistry is in @proj-airi/speech-transformer-chem.
const formulas = [
  String.raw`\lim_{n \to \infty}\sum_{i=1}^{n}\frac{1}{i^2}=\frac{\pi^2}{6}`,
  String.raw`\lim_{x \to 0^{+}}\ln x=-\infty`,
  String.raw`\sum_{k=1}^{n} k=\frac{n(n+1)}{2}`,
  String.raw`\frac{1}{1+\frac{1}{x}}`,
  String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`,
  String.raw`\triangle ABC \sim \triangle DEF`,
  String.raw`x \in (0, b]`,
  String.raw`\{x \mid x > 0\}`,
  String.raw`f: X \to Y, x \mapsto y`,
  String.raw`\frac{d}{dx}x^{n}=nx^{n-1}`,
  String.raw`\int_0^1 x^2\,dx=\frac{1}{3}`,
  String.raw`9.8\,\mathrm{m/s^2}`,
  String.raw`25^\circ\mathrm{C}`,
]
const parsed = formulas.map(tex => parseMath(tex))
const lowered = parsed.map(lowerMath)

// The hand-written parser and reader that this pipeline replaced read these formulas about 2.4 times faster
// (0.22 ms against 0.52 ms for all of them, 2026-10-20). KaTeX parsing is the largest layer.
bench('read all formulas once', () => {
  for (const tex of formulas)
    renderMath(lowerMath(parseMath(tex)), en)
})

describe('layers', () => {
  bench('parse (KaTeX and normalize)', () => {
    for (const tex of formulas)
      parseMath(tex)
  })

  bench('lower (syntax to MathJSON)', () => {
    for (const tree of parsed)
      lowerMath(tree)
  })

  bench('render (MathJSON to words)', () => {
    for (const expression of lowered)
      renderMath(expression, en)
  })
})
