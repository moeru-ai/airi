import type { FormulaSpeechCase } from '../../cases/formula-speech/cases'

import { describe, expect, it } from 'vitest'

import { grade, majorityScore } from '.'
import { formulaSpeechCases } from '../../cases/formula-speech/cases'

const cases = new Map(formulaSpeechCases.map(item => [item.id, item]))

describe('grade', () => {
  // Ported from the T-157 scorer self test. It covers the three judge defects that the manual calibration found,
  // letter case, strict chemistry, currency, and units.
  it.each([
    ['lim-sinx', String.raw`\lim_{x \to 0}\frac{x}{\sin x}=1`, 0, 'review #9: symbolic evaluated both limits to 1; operators must match'],
    ['lim-basel', String.raw`\lim_{n\to\infty}\sum_{i=1}^{n}\frac{1}{i}=\frac{\pi^2}{6}`, 0, 'summand 1/i is not 1/i^2'],
    ['lim-onesided', String.raw`\lim_{x \to 0^+} \ln x = -\infty`, 1, 'review #6: 0^{+} vs 0^+ (natural `}}` was read as an escaped brace)'],
    ['set-notin', String.raw`\sqrt{2}\notin\mathbb{Q}`, 1, 'review #96/#104: \\notin\\mathbb{Q} without a space'],
    ['set-cup', String.raw`A \cup B = \{1,2,3\}`, 1, 'escaped set braces still compare'],
    ['chem-hydrate', String.raw`\ce{CuSO4 \cdot 5H2O}`, 1, 'review B#7: \\cdot hydrate dot'],
    ['lim-onesided', String.raw`\lim_{x \to +0} \ln x = -\infty`, 1, 'Japanese x→+0 is 0^+'],
    ['lim-basel', String.raw`\lim_{n \to \infty}\sum_{i=1}^{n}\frac{1}{i^2}=\frac{6}{\pi^2}`, 0, 'T-153 ko 6/π² inversion must fail'],
    ['lim-basel', String.raw`\lim_{n\to\infty}\sum_{i=1}^{n}\frac{1}{i^{2}}=\frac{\pi^{2}}{6}`, 1, 'same formula, other braces'],
    ['frac-pi2-6', String.raw`\frac{6}{\pi^2}`, 0, 'inverse fraction'],
    ['frac-6-pi2', String.raw`6/\pi^2`, 1, 'slash form is equivalent (symbolic)'],
    ['sum-gauss', String.raw`\sum_{k=1}^{n} k = \frac{n^2+n}{2}`, 1, 'expanded numerator (symbolic)'],
    ['frac-mb-sigma', String.raw`\sigma_0 = f - \frac{1}{2}`, 0, '(f-1)/2 vs f-1/2 grouping'],
    ['lim-sinx', String.raw`\lim_{x\to 0} \frac{\sin(x)}{x} = 1`, 1, 'parenthesised argument'],
    ['case-fold-tri', String.raw`\triangle abc`, 1, 'case folded: speech cannot carry case'],
    ['rel-perp', String.raw`ab \perp cd`, 1, 'T-153 relations: case folded'],
    ['case-fold-ema', String.raw`e = m c^2`, 1, 'case folded'],
    ['prob-fm-loss', String.raw`l_{fm}(\theta)=\mathbb{E}_{t\sim U([0,1]),\,x\sim p_t}\left[\left\|v_\theta(x,t)-u_t(x)\right\|^2\right]`, 1, 'L has one case, and U([0,1]) is U[0,1]'],
    ['prob-fm-loss', String.raw`l_{fm}(\theta)=\mathbb{E}_{t\sim u[0,1],\,x\sim p_t}\left[\left\|v_\theta(x,t)-u_t(x)\right\|^2\right]`, 0, 'U and u are both in the reference'],
    ['case-sens-aA', String.raw`a \in a`, 0, 'a and A both in reference: listener must hear "capital"'],
    ['case-sens-aA', String.raw`a \in A`, 1, 'distinction kept'],
    ['case-sens-nN', String.raw`n = n + 1`, 0, 'N vs n lost'],
    ['case-sens-omega', String.raw`\omega \neq \omega`, 0, 'Ω vs ω lost'],
    ['case-sens-omega', String.raw`\Omega \ne \omega`, 1, 'kept; \\ne alias'],
    ['chem-water', String.raw`\ce{H2 + O2 -> H2O}`, 1, 'no coefficients: the substances of a textbook reading'],
    ['chem-water', String.raw`\ce{H2 + O2 -> H2O2}`, 0, 'no coefficients, but another product'],
    ['chem-water', String.raw`\ce{2H2 + O2 -> H2O}`, 0, 'one coefficient dropped'],
    ['chem-water', String.raw`\ce{O2 + 2H2 -> 2H2O}`, 1, 'reactant order is free'],
    ['chem-water', String.raw`2H_2 + O_2 \rightarrow 2H_2O`, 1, 'plain LaTeX arrow form'],
    ['chem-water', String.raw`\ce{2H2 + O2 = 2H2O}`, 1, '= is the Chinese textbook arrow'],
    ['chem-water', String.raw`\ce{2H2 + O2 <=> 2H2O}`, 0, 'wrong arrow class'],
    ['chem-water', String.raw`\ce{2H2 + O2 -> 2H2O2}`, 0, 'H2O2 is not H2O'],
    ['chem-co2', String.raw`\ce{C + O2 -> CO}`, 0, 'CO is not CO2'],
    ['chem-ca-oh', String.raw`\ce{CaOH2 + CO2 -> CaCO3 + H2O}`, 0, 'lost (OH) group changes the formula'],
    ['chem-ca-oh', String.raw`\ce{Ca(OH)2 + CO2 -> CaCO3 v + H2O}`, 1, 'precipitate mark ignored'],
    ['chem-hydrate', String.raw`\ce{CuSO4.5H2O}`, 1, 'hydrate dot form'],
    ['chem-hydrate', String.raw`\ce{CuSO4}`, 0, 'water of crystallisation lost'],
    ['chem-haber', String.raw`\ce{N2 + 3H2 -> 2NH3}`, 0, 'reversible arrow lost'],
    ['cur-two', String.raw`苹果 \$3，香蕉 \$5`, 1, 'two USD amounts'],
    ['cur-two', String.raw`苹果 3，香蕉 5`, 0, 'dollar sign lost'],
    ['cur-thousand', String.raw`The rent is \$1,200 a month`, 1, 'thousands separator'],
    ['cur-thousand', String.raw`The rent is \$1 200`, 0, 'read as 1 and 200'],
    ['cur-mixed', String.raw`A ticket is \$5, and the area is $x^2$`, 1, 'money + math'],
    ['cur-mixed', String.raw`A ticket is 5, and the area is x`, 0, 'both lost'],
    ['unit-temp', String.raw`25°C`, 1, 'degree sign'],
    ['unit-g', String.raw`9.8\ \text{m/s}^2`, 1, 'text unit'],
    ['unit-g', String.raw`9.8\ \text{m/s}`, 0, 'square lost'],
    ['set-cap-empty', String.raw`A \cap B = \emptyset`, 1, 'empty set alias'],
    ['set-interval', String.raw`x \in [0, b]`, 0, 'closed interval is not half-open'],
  ] as const)('grades %s as %s: %s', (id, hypothesis, expected, _reason) => {
    expect(grade(cases.get(id)!, hypothesis).score).toBe(expected)
  })

  it('accepts the spaced braces of MathBridge references', () => {
    // MathBridge writes a space after each token, as in `_ { u }`. The answer `_u` is the same formula.
    const item = (reference: string): FormulaSpeechCase => ({ id: 'mb', stratum: 'math-bridge', source: 'MathBridge', mode: 'symbolic', reference, input: `$${reference}$`, note: '' })
    expect(grade(item(String.raw`\lambda_ { \mathrm { u } } \rightarrow\infty`), String.raw`\lambda_u \to \infty`).score).toBe(1)
    expect(grade(item(String.raw`b\in\mathbb { N } ^ { + }`), String.raw`b\in\mathbb{N}^{+}`).score).toBe(1)
    expect(grade(item(String.raw`R_ { 0 , \mathrm { b } } =H_ { \mathrm { b } }`), String.raw`R_{0,b}=H_b`).score).toBe(1)
  })

  it('scores an empty answer 0 and does not throw on malformed LaTeX', () => {
    expect(grade(cases.get('lim-basel')!, '')).toEqual({ score: 0, rule: 'empty' })
    expect(grade(cases.get('lim-basel')!, String.raw`\frac{{{`).score).toBe(0)
  })
})

describe('majorityScore', () => {
  it('passes only with a strict majority', () => {
    expect(majorityScore([1, 0, 1])).toBe(1)
    expect(majorityScore([1, 0])).toBe(0)
    expect(majorityScore([0, 0, 1])).toBe(0)
  })
})
