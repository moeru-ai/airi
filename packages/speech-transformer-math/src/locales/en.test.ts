import { describe, expect, it } from 'vitest'

import { MathSpeech } from '../speech'

const speech = new MathSpeech()
const basel = String.raw`\lim_{n \to \infty}\sum_{i=1}^{n}\frac{1}{i^2}=\frac{\pi^2}{6}`

describe('speakMath', () => {
  it('reads the Basel sum', () => {
    expect(speech.speak(basel, 'en')).toBe('the limit as n approaches infinity of the sum from i equals one to n of the fraction with numerator one and denominator i squared equals pi squared over six')
  })

  it.each([
    [String.raw`AB \perp CD`, 'A B is perpendicular to C D'],
    [String.raw`l_1 \parallel l_2`, 'l one is parallel to l two'],
    [String.raw`a \leq b`, 'a is less than or equal to b'],
    [String.raw`x \in A`, 'x is an element of A'],
    [String.raw`A \subseteq B`, 'A is a subset of or equal to B'],
    [String.raw`\angle ABC = 90^\circ`, 'angle A B C equals ninety degrees'],
    [String.raw`\triangle ABC \sim \triangle DEF`, 'triangle A B C is similar to triangle D E F'],
    [String.raw`(a+b)^2`, 'the square of the quantity a plus b'],
    [String.raw`\sqrt[3]{8} = 2`, 'the cube root of eight equals two'],
    [String.raw`|x| \geq 0`, 'the absolute value of x is greater than or equal to zero'],
    [String.raw`\int_0^1 x^2 dx`, 'the integral from zero to one of x squared d x'],
    [String.raw`-x^{-1}`, 'negative x to the power of negative one'],
    [String.raw`50\%`, 'fifty percent'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })

  it.each([
    [String.raw`t \in [0,1]`, 't is an element of the closed interval from zero to one'],
    [String.raw`x \in (0,1)`, 'x is an element of the open interval from zero to one'],
    [String.raw`x \in [0, 1)`, 'x is an element of the interval from zero inclusive to one exclusive'],
    [String.raw`x \in \left(0, 1\right]`, 'x is an element of the interval from zero exclusive to one inclusive'],
  ])('reads the interval %s', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })

  it('reads a pair as an interval only when a set symbol or an infinite bound shows it', () => {
    expect(speech.speak(String.raw`A \cup (1, 2)`, 'en')).toBe('A union the open interval from one to two')
    expect(speech.speak(String.raw`f(x, y) = 0`, 'en')).toBe('f of x, y equals zero')
  })

  it('reads ceilings, near relations, composition, big set operators, and labels in subscripts', () => {
    expect(speech.speak(String.raw`m = \lceil \alpha \rceil`, 'en')).toBe('m equals the ceiling of alpha')
    expect(speech.speak(String.raw`n \gtrsim 10`, 'en')).toBe('n is greater than or approximately ten')
    expect(speech.speak(String.raw`\pi \nmid m`, 'en')).toBe('pi does not divide m')
    expect(speech.speak(String.raw`\varphi \coloneqq \iota \circ \mu`, 'en')).toBe('phi is defined as iota composed with mu')
    expect(speech.speak(String.raw`\bigcap_{i=1}^{r} E_i`, 'en')).toBe('the intersection from i equals one to r of E sub i')
    // A word in a subscript is a label: `t` is not tonnes.
    expect(speech.speak(String.raw`I_{\rm t} = 100`, 'en')).toBe('I sub t equals one hundred')
    // Every digit before a scripted digit joins the number.
    expect(speech.speak(String.raw`45.1_{\pm 0.5}`, 'en')).toBe('forty-five point one plus or minus zero point five')
  })

  it('reads parentheses that a neighbor binds to, so the grouping is not lost', () => {
    expect(speech.speak(String.raw`v-(x-\epsilon)`, 'en')).toBe('v minus the quantity x minus epsilon')
    // The times word ends a spoken group, so epsilon is not heard inside it.
    expect(speech.speak(String.raw`(1-t)\epsilon`, 'en')).toBe('the quantity one minus t times epsilon')
    // After a plus, the brackets change nothing, so they stay silent.
    expect(speech.speak(String.raw`a+(b+c)`, 'en')).toBe('a plus b plus c')
  })

  it('reads arXiv notation that the MathBridge review found', () => {
    // A blackboard letter without an argument names a space or a measure, not an expectation.
    expect(speech.speak(String.raw`(\Omega, \mathcal{F}, \mathbb{P})`, 'en')).toBe('the tuple omega, F, P')
    expect(speech.speak(String.raw`\mathbb{E}[X]`, 'en')).toBe('the expected value of X')
    // In measurements, `\sim` before a quantity means about.
    expect(speech.speak(String.raw`\sim 50`, 'en')).toBe('about fifty')
    expect(speech.speak(String.raw`z \sim 1`, 'en')).toBe('z is approximately equal to one')
    expect(speech.speak(String.raw`\|\cdot\|`, 'en')).toBe('the norm')
    expect(speech.speak(String.raw`x := y + 1`, 'en')).toBe('x is defined as y plus one')
    expect(speech.speak(String.raw`F(A, {\bf B})`, 'en')).toBe('F of A, B')
    expect(speech.speak(String.raw`1.4 M_\odot`, 'en')).toBe('one point four solar masses')
    expect(speech.speak(String.raw`\cap_{i=1}^{r} E_i`, 'en')).toBe('the intersection from i equals one to r of E sub i')
    expect(speech.speak(String.raw`Z \sim \mathcal{CN}(0, 1)`, 'en')).toBe('Z drawn from C N of zero, one')
    // Superscripts that label instead of raising, and boundaries that a listener needs.
    expect(speech.speak(String.raw`x \in \mathbb{P}^n`, 'en')).toBe('x is an element of P n')
    expect(speech.speak(String.raw`X \in L^p(\Omega)`, 'en')).toBe('X is an element of L p of omega')
    expect(speech.speak(String.raw`K^\dagger`, 'en')).toBe('K dagger')
    expect(speech.speak(String.raw`G = (V, E)`, 'en')).toBe('G equals the pair V, E')
    expect(speech.speak(String.raw`\frac{7}{60} k`, 'en')).toBe('seven over sixty times k')
    expect(speech.speak(String.raw`|q|^2`, 'en')).toBe('the squared absolute value of q')
    expect(speech.speak(String.raw`(e_1, \dots, e_n)`, 'en')).toBe('the tuple e one, and so on, up to e sub n')
    expect(speech.speak(String.raw`vMF(\mu, \kappa)`, 'en')).toBe('v M F of mu, kappa')
  })

  it('reads like a presenter, not like a dictation', () => {
    // A mark after a symbol is said with it, without the word superscript.
    expect(speech.speak(String.raw`\Theta^*`, 'en')).toBe('theta star')
    expect(speech.speak(String.raw`K_i^\dag`, 'en')).toBe('K sub i dagger')
    expect(speech.speak(String.raw`\mathbb{L}^\infty(X)`, 'en')).toBe('L infinity of X')
    // Only the capital says its case, and the norm itself has no argument to read.
    expect(speech.speak(String.raw`\sum_{k=1}^{K} x_k`, 'en')).toBe('the sum from k equals one to capital K of x sub k')
    expect(speech.speak(String.raw`\|\cdot\|_2`, 'en')).toBe('the two-norm')
    // Measurements read as a person says them.
    expect(speech.speak(String.raw`\approx 7`, 'en')).toBe('about seven')
    expect(speech.speak(String.raw`\sim 1\,\mathrm{mm}`, 'en')).toBe('about one millimeter')
    expect(speech.speak(String.raw`45.1_{\pm 0.5}`, 'en')).toBe('forty-five point one plus or minus zero point five')
    // The square of a group is said before it, so it does not sound like the square of its last term.
    expect(speech.speak(String.raw`(1+\sqrt{\delta})^2`, 'en')).toBe('the square of the quantity one plus the square root of delta')
  })

  it('reads like a Chinese teacher', () => {
    expect(speech.speak(String.raw`2.5e10`, 'en')).toBe('two point five times ten to the power of ten')
  })

  it('reads an integral with an infinite bound as an improper integral', () => {
    const tex = String.raw`\int_0^{+\infty} e^{-x}\,dx`
    expect(speech.speak(tex, 'en')).toBe('the improper integral from zero to positive infinity of e to the power of negative x d x')
  })

  it.each([
    [String.raw`A \setminus B`, 'A minus B'],
    [String.raw`A \triangle B`, 'A symmetric difference B'],
    [String.raw`A \sqcup B`, 'A disjoint union B'],
    [String.raw`A^c`, 'the complement of A'],
    [String.raw`A^{\complement}`, 'the complement of A'],
    [String.raw`\complement_U A`, 'the complement of A in U'],
    [String.raw`\mathcal{P}(A)`, 'the power set of A'],
    [String.raw`\#A`, 'the number of elements of A'],
    [String.raw`\operatorname{card}(A)`, 'the number of elements of A'],
    [String.raw`A \ni x`, 'A contains x'],
    [String.raw`A \supsetneq B`, 'A is a proper superset of B'],
    [String.raw`A \nsubseteq B`, 'A is not a subset of B'],
    [String.raw`\nexists x`, 'there does not exist x'],
    [String.raw`a \ll b`, 'a is much less than b'],
    [String.raw`a \gg b`, 'a is much greater than b'],
  ])('reads the set notation %s', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })

  it('reads an unknown command by its name and does not fail on unbalanced input', () => {
    expect(speech.speak(String.raw`\foo{x}`, 'en')).toBe('foo x')
    expect(speech.speak(String.raw`\frac{1}{`, 'en')).toBe('one over')
  })
})

// The cases below come from the formula speech eval, where a StepFun voice read the rule output.
// Each one failed to reach the listener before, because the text left a choice to the voice or to the listener.
describe('speakMath readings that a voice cannot get wrong', () => {
  it('spells numbers in English, Japanese, and Korean, and keeps Chinese digits', () => {
    const tex = String.raw`\frac{1}{2}+\frac{1}{3}=\frac{5}{6}`
    // A Chinese voice read the 1 of `1 over 2` as yī, which an English listener heard as "E".
    expect(speech.speak(tex, 'en')).toBe('one over two plus one over three equals five over six')
  })

  it.each([
    [String.raw`a \in A`, 'a is an element of capital A'],
    [String.raw`\Omega \neq \omega`, 'capital omega is not equal to omega'],
  ])('says the case of a letter that %s uses in both cases', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })

  it('keeps the case unsaid when each letter has one case', () => {
    expect(speech.speak('E=mc^2', 'en')).toBe('E equals m c squared')
  })

  it.each([
    [String.raw`9.8\,\mathrm{m/s^2}`, 'nine point eight meters per second squared'],
    [String.raw`3\times10^{8}\,\mathrm{m/s}`, 'three times ten to the power of eight meters per second'],
    [String.raw`25^\circ\mathrm{C}`, 'twenty-five degrees Celsius'],
    [String.raw`5\,\mathrm{kg}`, 'five kilograms'],
  ])('reads the unit of %s as words', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })

  it.each([
    // A compound part names the numerator and the denominator, so the listener knows where each one ends.
    [String.raw`\frac{1}{1+\frac{1}{x}}`, 'the fraction with numerator one and denominator one plus one over x'],
    [String.raw`\frac{f-1}{2}`, 'the fraction with numerator f minus one and denominator two'],
    // A power after the second-read part could bind to the whole fraction, so it names both parts too.
    [String.raw`\frac{\pi^2}{6}`, 'pi squared over six'],
    [String.raw`\frac{6}{\pi^2}`, 'the fraction with numerator six and denominator pi squared'],
  ])('reads the fraction %s with clear bounds', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })

  it('reads a sum in parentheses that multiplies as a quantity', () => {
    expect(speech.speak(String.raw`\frac{n(n+1)}{2}`, 'en')).toBe('the fraction with numerator n the quantity n plus one and denominator two')
    expect(speech.speak(String.raw`f(x, y) = 0`, 'en')).toBe('f of x, y equals zero')
  })

  it('reads a derivative, a one-sided limit, a subscript, and a function signature', () => {
    expect(speech.speak(String.raw`\frac{dy}{dx}`, 'en')).toBe('the derivative with respect to x of y')
    expect(speech.speak(String.raw`\lim_{x \to 0^{-}} x`, 'en')).toBe('the limit as x approaches zero from the left of x')
    expect(speech.speak(String.raw`x_1 \leq \cdots \leq x_n`, 'en')).toBe('x one is less than or equal to and so on is less than or equal to x sub n')
    expect(speech.speak(String.raw`k = 1, \dots, d`, 'en')).toBe('k equals one, and so on, up to d')
    expect(speech.speak(String.raw`f: X \to Y, x \mapsto y`, 'en')).toBe('f is a function from capital X to capital Y, x maps to y')
  })
})

describe('readings of the second review', () => {
  it.each([
    // A function command before parentheses calls them, also with a sum inside.
    [String.raw`\ln(x+1)`, 'natural log of the quantity x plus one'],
    [String.raw`\gcd(a,b)`, 'gcd of a, b'],
    [String.raw`\operatorname{tr}(A+B)`, 'tr of the quantity A plus B'],
    [String.raw`\mathrm{GL}(n,\mathbb{R})`, 'GL of n, the real numbers'],
    // Upright d, e, and i are letters, and an upright T over a matrix is its transpose.
    [String.raw`\int_0^1 f(x)\,\mathrm{d}x`, 'the integral from zero to one of f of x d x'],
    [String.raw`A^\mathrm{T}`, 'A T'],
    [String.raw`f''(x)`, 'f prime prime of x'],
    [String.raw`f^{-1}(x)`, 'f inverse of x'],
    [String.raw`x^{-1}`, 'x to the power of negative one'],
    [String.raw`x^{2}(t)`, 'x squared t'],
    // Scientific notation needs its parts together. With spaces, e is Euler's number.
    [String.raw`2e - 1`, 'two e minus one'],
    [String.raw`2.5e10`, 'two point five times ten to the power of ten'],
    [String.raw`1,000,000`, 'one million'],
    [String.raw`[1,100]`, 'the closed interval from one to one hundred'],
    [String.raw`x = 2 \quad 3`, 'x equals two three'],
    [String.raw`.5`, 'zero point five'],
    [String.raw`007`, 'zero zero seven'],
    [String.raw`n^{\text{th}}`, 'n-th'],
    [String.raw`|x - |y||`, 'the absolute value of x minus the absolute value of y'],
    [String.raw`\frac{d^2 y}{dx^2}`, 'the second derivative with respect to x of y'],
    [String.raw`f(x)=\begin{cases}1 & x>0\\0 & \text{otherwise}\end{cases}`, 'f of x equals one if x is greater than zero, zero otherwise'],
    [String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`, 'the matrix with row one: one, two; row two: three, four'],
    [String.raw`\begin{aligned}a&=b\\&=c\end{aligned}`, 'a equals b equals c'],
    [String.raw`\mathrm{Rt}\triangle ABC`, 'right triangle A B C'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })

  it.each([
    [String.raw`\mathrm{s^{-1}}`, 'per second'],
    [String.raw`3\,\mathrm{mol\,L^{-1}}`, 'three moles per liter'],
    [String.raw`5\,\mathrm{kg\cdot m^2}`, 'five kilogram square meters'],
    [String.raw`8.31\,\mathrm{J\,mol^{-1}\,K^{-1}}`, 'eight point three one joules per mole kelvin'],
    [String.raw`10\,\mathrm{dB}`, 'ten decibels'],
    [String.raw`3\,\mathrm{ft}`, 'three feet'],
  ])('reads the unit of %s', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })
})

describe('mappings of the review', () => {
  it.each([
    // The bar inside an argument is a condition. Between two operands, it divides.
    [String.raw`P(A \mid B)`, 'P of A given B'],
    [String.raw`\mathbb{E}[X \mid Y]`, 'the expected value of X given Y'],
    [String.raw`a \mid b`, 'a divides b'],
    [String.raw`R = 10\,\Omega`, 'R equals ten ohms'],
    [String.raw`\mathbb{N}^{+}`, 'the positive integers'],
    [String.raw`a \equiv b \pmod{n}`, 'a is congruent to b modulo n'],
    [String.raw`\sqrt[4]{x}`, 'the fourth root of x'],
    [String.raw`A \supseteq B`, 'A is a superset of or equal to B'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })
})

describe('readings of the eval review', () => {
  it.each([
    // In "the squared norm of v minus u", two of three listeners put the minus outside the norm.
    [String.raw`\|v_\theta(x_t,t)-(x-\epsilon)\|^2`, 'the squared norm of the difference between v sub theta of x sub t, t and the quantity x minus epsilon'],
    [String.raw`E=mc^2`, 'E equals m c squared'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })
})
