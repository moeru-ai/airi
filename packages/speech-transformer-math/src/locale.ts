/**
 * The language of a locale pack: a BCP 47 primary language subtag, for example `zh` or `ko`.
 * The built-in packs are `zh`, `en`, `ja`, and `ko`. A registered pack adds its own, see ./locales.
 */
export type MathLanguage = string

/** Builds a relation from its two spoken operands. Some languages put the words around both operands. */
export type Relation = (left: string, right: string) => string

/**
 * How hard one part of a fraction is to hear.
 *
 * - `simple`: a number, a letter, or a product such as `2a`.
 * - `scripted`: it has a power or a subscript, for example `\pi^2`.
 * - `compound`: it has an operator, a relation, a parenthesized sum, or another fraction, for example `n-1`.
 */
export type FractionPart = 'simple' | 'scripted' | 'compound'

/** What the reader knows about a fraction, so each lexicon can choose the reading that the listener parses. */
export interface FractionShape {
  numerator: FractionPart
  denominator: FractionPart
  /**
   * True when an operator comes before the fraction and its denominator is not a number, as in `1+\frac{1}{x}`.
   * A language that reads the denominator first then cannot show where the operand before it ends: いちプラスエックス分のいち.
   */
  followsOperator: boolean
}

/**
 * The words of units in one language. ./units decides which symbols are units: the SI prefixes, the SI units, and the
 * units accepted for use with SI. A locale only names them.
 */
export interface UnitLocale {
  /** Words of the SI prefixes, keyed by symbol, for example `k` or `µ`. */
  prefixes: Readonly<Record<string, string>>
  /** Words of the units that take a prefix, keyed by symbol, for example `m` or `Hz`. */
  units: Readonly<Record<string, string>>
  /** Words of the units that do not take a prefix, for example `min` or `ha`. */
  plain: Readonly<Record<string, string>>
  /** Words for whole symbols that the composition of prefix and unit reads badly, for example `kg` in Chinese. */
  overrides?: Readonly<Record<string, string>>
  /** Joins the words of a product of units, as `kg m^2`. The default is a space. Chinese and Japanese write none. */
  joinFactors?: (words: readonly string[]) => string
  /** Words of a unit after "per", where they differ from `plain`, as Japanese 時 in 毎時 for `km/h`. */
  denominators?: Readonly<Record<string, string>>
  /** Optional: the singular of a unit word, after the number one, as "one millimeter", or after "per". */
  singular?: (words: string) => string
  /** Adds the power of a unit, for example square meters or 平方米. */
  power: (words: string, power: '2' | '3') => string
}

/**
 * A locale pack: every word that the speech pipeline needs in one language.
 *
 * A pack is data and small functions. A contributor adds a language with one pack and registers it, see ./locales.
 * `language` is the BCP 47 primary language subtag of the pack, for example `ko`.
 */
export interface MathLocale {
  language: string
  /** Joins spoken words. Chinese and Japanese words join without a space, other words with one space. */
  join: (parts: readonly string[]) => string
  /** Reads a decimal number, for example `3.14`. Chinese keeps the digits, see ./numbers. */
  number: (digits: string) => string
  /**
   * Reads one Latin letter, for example a variable. Japanese and Korean use the letter name, such as エム or 엠,
   * because a voice can read a bare letter in another language.
   */
  letter: (letter: string) => string
  /** Marks the case of a letter, when one formula has both cases of it, for example `a \in A` or `\Omega \neq \omega`. */
  letterCase: (spoken: string, upper: boolean) => string
  /** Joins clauses that a comma separates, for example `f: X \to Y, x \mapsto y`. */
  clauses: (parts: readonly string[]) => string
  /** Reads `cases`. A case without a condition is the last one, "otherwise". */
  cases: (items: readonly { value: string, condition?: string }[]) => string
  /** Reads the rows of a matrix, or of a determinant when `determinant` is true. Each row lists its cells. */
  matrix: (rows: readonly (readonly string[])[], determinant: boolean) => string
  /**
   * Joins the items of a list, for example `r, s` or the conditions of `\mathbb{E}_{t \sim U, x \sim p}`.
   * Chinese and Japanese use 、 here, because a full comma sounds like the end of a clause.
   */
  list: (items: readonly string[]) => string
  /** Words for single symbols and commands. A missing key is read by its name. */
  words: Readonly<Record<string, string>>
  operators: Readonly<Record<string, string>>
  /** The unary minus. */
  negative: string
  /** The unary plus, for example in `+\infty`. */
  positive: string
  relations: Readonly<Record<string, Relation>>
  /**
   * Reads a fraction. A part that is hard to hear makes the reading name the numerator and the denominator, so the
   * listener knows where each one ends. Which parts are hard depends on the word order of the language.
   */
  fraction: (numerator: string, denominator: string, shape: FractionShape) => string
  /**
   * Reads `\frac{d}{dx} f`, the derivative of `body` with respect to `variable`. `order` is the digits of a higher
   * derivative, as `2` in `\frac{d^2 y}{dx^2}`.
   */
  derivative: (variable: string, body: string, order?: string) => string
  power: (base: string, exponent: string) => string
  squared: (base: string) => string
  cubed: (base: string) => string
  degrees: (base: string) => string
  prime: (base: string) => string
  /**
   * A superscript that is a mark, not a power, for example `\mathbb{N}^{+}` or `f^{(n)}`.
   * `parenthesized` is true for `^{(n)}`, so the listener hears the parentheses of an order or a label.
   */
  superscript: (base: string, mark: string, parenthesized: boolean) => string
  /**
   * Words of the marks that follow a symbol as a superscript, as star in `x^*` or dagger in `K^\dagger`. A mark is said
   * right after its symbol, as a presenter says it, never as a superscript.
   */
  marks: Readonly<Record<string, string>>
  /**
   * Reads a function call, for example `f(x)` or `H_k(M, N)`.
   * `grouped` is true when the arguments are hard to hear without their parentheses: more than one argument, or one
   * argument with an operator, as in `f(x+1)`. A simple call such as `f(x)` reads without them.
   * `decorated` is true when the name has an accent, a subscript, or several letters, as `\\hat H(t)`, `q_m(t)`, or
   * `\\mathcal O(n)`. A pack that
   * reads a simple call as the product does, as Chinese H帽t, says the brackets then, so it is not heard as a product.
   */
  apply: (name: string, args: readonly string[], grouped: boolean, decorated: boolean) => string
  /** The last item of a list after an ellipsis, as `d` in `k = 1, \dots, d`: "up to d". */
  upTo: (item: string) => string
  /**
   * Reads the item before an ellipsis and the last item as one range, for example Japanese いちからエヌまで for
   * `1, \dots, n`. The ellipsis has no word then. A pack without it reads the ellipsis word and {@link MathLocale.upTo}.
   */
  range?: (from: string, to: string) => string
  /**
   * Reads a chain of relations, as `a < b < c` or `x_1 \leq \cdots \leq x_n`. `operands` has one more item than
   * `relations`, and an ellipsis operand is undefined. A pack without it nests the relations, which reads well when a
   * relation is a word between its operands, as English "is less than".
   */
  chain?: (operands: readonly (string | undefined)[], relations: readonly Relation[]) => string
  /** The `\cdot` that marks an empty argument slot, as in `p(\cdot)`. */
  placeholder: string
  /**
   * The times word after a spoken group, as `(1-t)\\epsilon`, when it differs from the operator word. Chinese says 乘以,
   * because 差乘 after 1与t的差 is heard as 叉乘, the cross product.
   */
  groupTimes?: string
  /** A number under a letter, for example `x_0`, said without a subscript word: x zero. */
  numberIndex: (base: string, index: string) => string
  /** A simple subscript, for example `x_t`. */
  index: (base: string, index: string) => string
  /** A subscript with more than one symbol, for example `x_{i+1}`. */
  subscript: (base: string, subscript: string) => string
  /** `compound` is true when the radicand has an operator, as `a^2+b^2`, so the reading can say where it starts. */
  root: (radicand: string, degree?: string, compound?: boolean) => string
  /** The inverse of a function, as `f^{-1}` or `\\cos^{-1}`. It is not a power. */
  inverse: (name: string) => string
  /** A condition inside an argument, as `P(A \\mid B)`: `event` given `condition`. */
  given: (event: string, condition: string) => string
  /** `\\pmod{n}` alone. */
  modulo: (modulus: string) => string
  /** `a \\equiv b \\pmod{n}`: a congruence. */
  congruent: (left: string, right: string, modulus: string) => string
  /** An ordinal written with a superscript, as `n^{\\text{th}}`. */
  ordinal: (value: string) => string
  /** `side` is set for a one-sided limit, for example `x \to 0^{+}`, which approaches from the right. */
  limit: (body: string, variable?: string, target?: string, condition?: string, side?: 'left' | 'right') => string
  /**
   * Reads an arrow between two objects that do not approach each other, for example the map `H_k(M) \to H_k(M, N)`.
   * An arrow toward a number or a variable is a limit and reads with `relations['\\to']`, see ./lower.
   */
  arrow: (from: string, to: string) => string
  /**
   * Reads a norm, for example `\|x\|`. `index` names the norm, as `2` in `\|x\|_2`. `squared` is true for `\|x\|^2`,
   * so the reading says "the squared norm of x" instead of the ambiguous "the norm of x squared".
   */
  norm: (inner: string, index: string | undefined, squared: boolean) => string
  /**
   * Reads a difference inside a norm, as `\\|a - b\\|`, so the listener hears where the norm ends. English says "the
   * norm of the difference between a and b": in "the norm of a minus b", the minus can be outside the norm.
   */
  normDifference?: (left: string, right: string) => string
  /**
   * Reads an operator of probability, for example `\mathbb{E}_{x \sim p}[f(x)]`. `condition` is its subscript: the
   * variables or the distributions that it averages over.
   */
  statistic: (kind: 'Expectation' | 'Probability' | 'Variance' | 'Covariance', body: string, condition?: string) => string
  /** Reads a quantity after a leading `\sim`, as in `\sim 50`: about fifty. */
  about: (quantity: string) => string
  /** Reads `x \sim p`: x is drawn from the distribution p. */
  distributed: (variable: string, distribution: string) => string
  /** `\\lceil x \\rceil` and `\\lfloor x \\rfloor`. */
  ceil: (inner: string) => string
  floor: (inner: string) => string
  /** A pair or a tuple in parentheses, for example `(V, E)`. */
  tuple: (items: readonly string[]) => string
  /**
   * Optional: the square of a group as one phrase, as "the square of the quantity a plus b". Without it, the square comes
   * after the group, where it can sound like the square of its last term.
   */
  squareOf?: (group: string) => string
  /** Optional: a squared absolute value, when the language reads it as one phrase, as "the squared absolute value of q". */
  absoluteSquared?: (inner: string) => string
  /** Square brackets that are not an interval, for example the class `[M]`. */
  bracket: (inner: string) => string
  /** Reads a function signature, for example `f: X \to Y`. */
  mapping: (name: string, from: string, to: string) => string
  /**
   * `kind` is the operator: `sum`, `prod`, or `int`.
   * `improper` is set for an integral with an infinite bound.
   */
  bigOperator: (kind: 'sum' | 'prod' | 'int' | 'union' | 'intersection', body: string, bounds: { variable?: string, from?: string, to?: string, condition?: string, improper?: boolean }) => string
  absolute: (inner: string) => string
  /** A parenthesized group that is the base of a power. */
  quantity: (inner: string) => string
  /**
   * Optional words for a group of two simple terms, for example Chinese a 与 b 的和 for `(a+b)`. A pack without them
   * reads every group with {@link MathLocale.quantity}. With them, a product with a group also says its times word, as
   * in n 乘 n 与 1 的和 for `n(n+1)`, because the group no longer has spoken brackets that end the first factor.
   */
  groupOf?: { sum: (left: string, right: string) => string, difference: (left: string, right: string) => string }
  set: (inner: string, condition?: string) => string
  /** `closed` tells whether each bound belongs to the interval: `[` and `]` include it, `(` and `)` do not. */
  interval: (from: string, to: string, closed: { left: boolean, right: boolean }) => string
  /** `universe` is the set that the complement is taken in, for example `U` in `\complement_U A`. */
  complement: (set: string, universe?: string) => string
  powerSet: (set: string) => string
  cardinality: (set: string) => string
  percent: (number: string) => string
  accent: Readonly<Record<string, (base: string) => string>>
  /** A segment of geometry, for example `\overline{AB}`. */
  segment: (name: string) => string
  binomial: (n: string, k: string) => string
  units: UnitLocale
  /**
   * Reads a unit with a denominator, for example `m/s^2`. The words come from `units`.
   * `power` is the exponent of the denominator unit, for example `2` in `s^2`.
   */
  unitRatio: (numerator: string, denominator: string, power?: string) => string
  /** Reads a temperature in degrees Celsius, for example `25^\circ\mathrm{C}`. */
  celsius: (value: string) => string
  numberSets: Readonly<Record<string, string>>
}

const alphanumeric = /[a-z0-9]/i

/** Joins words without a space, except between two Latin letters or digits, so `AB` and `CD` stay apart. */
export function joinCompact(parts: readonly string[]): string {
  let result = ''
  for (const part of parts.map(part => part.trim()).filter(Boolean)) {
    const last = result.at(-1) ?? ''
    if (result && alphanumeric.test(last) && alphanumeric.test(part[0]!))
      result += ' '
    result += part
  }
  return result
}

export function joinSpaced(parts: readonly string[]): string {
  return parts.map(part => part.trim()).filter(Boolean).join(' ')
}

export const greekNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega'] as const
const greekLetters = 'αβγδεεζηθϑικλμνξοπρστυφφχψω'

/** Maps each Greek command and its Unicode letter to one word. Capitals use the same word. */
export function greek(words: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {}
  greekNames.forEach((name, index) => {
    const word = words[index]!
    result[`\\${name}`] = word
    result[`\\${name[0]!.toUpperCase()}${name.slice(1)}`] = word
    result[greekLetters[index]!] = word
  })
  return result
}

/**
 * The spellings of each relation and operator, keyed by one canonical spelling. Lexicons key their words by the
 * canonical spelling, and lowering uses it as the identity of the symbol.
 */
export const symbolAliases: Readonly<Record<string, readonly string[]>> = {
  '=': ['='],
  '\\neq': ['\\neq', '\\ne', '≠'],
  '<': ['<', '\\lt'],
  '>': ['>', '\\gt'],
  '\\leq': ['\\leq', '\\le', '\\leqq', '\\leqslant', '≤', '⩽'],
  '\\geq': ['\\geq', '\\ge', '\\geqq', '\\geqslant', '≥', '⩾'],
  '\\approx': ['\\approx', '≈'],
  '\\equiv': ['\\equiv', '≡'],
  '\\perp': ['\\perp', '\\bot', '⊥'],
  '\\parallel': ['\\parallel', '\\|', '∥'],
  '\\ll': ['\\ll', '≪'],
  '\\gg': ['\\gg', '≫'],
  '\\in': ['\\in', '∈'],
  '\\notin': ['\\notin', '∉'],
  '\\ni': ['\\ni', '\\owns', '∋'],
  '\\subseteq': ['\\subseteq', '⊆'],
  '\\subset': ['\\subset', '\\subsetneq', '⊂', '⊊'],
  '\\supseteq': ['\\supseteq', '⊇'],
  '\\supset': ['\\supset', '\\supsetneq', '⊃', '⊋'],
  '\\nsubseteq': ['\\nsubseteq', '⊈'],
  '\\nsupseteq': ['\\nsupseteq', '⊉'],
  '\\sim': ['\\sim', '\\backsim', '∽', '∼', '~'],
  '\\cong': ['\\cong', '≅'],
  '\\to': ['\\to', '\\rightarrow', '→', '\\longrightarrow'],
  '\\mapsto': ['\\mapsto', '↦'],
  '\\Rightarrow': ['\\Rightarrow', '\\implies', '⇒'],
  '\\Leftrightarrow': ['\\Leftrightarrow', '\\iff', '⇔'],
  '\\propto': ['\\propto', '∝'],
  '\\gtrsim': ['\\gtrsim', '≳'],
  '\\lesssim': ['\\lesssim', '≲'],
  '\\nmid': ['\\nmid', '∤'],
  '\\vdash': ['\\vdash', '⊢'],
  '\\coloneqq': ['\\coloneqq', '≔', '\\coloneq', ':='],
  '+': ['+'],
  '-': ['-', '−'],
  '\\times': ['\\times', '×', '*', '\\ast'],
  '\\cdot': ['\\cdot', '·', '⋅'],
  '\\div': ['\\div', '÷', '/'],
  '\\pm': ['\\pm', '±'],
  '\\mp': ['\\mp', '∓'],
  '\\cup': ['\\cup', '∪'],
  '\\cap': ['\\cap', '∩'],
  '\\setminus': ['\\setminus', '\\smallsetminus', '∖'],
  '\\sqcup': ['\\sqcup', '⊔'],
  // Only between two operands. A triangle that starts an operand is the shape, see `words`.
  '\\triangle': ['\\triangle', '△', '\\bigtriangleup'],
  '!': ['!'],
}

/** Each spelling with its canonical spelling, built once, because lowering looks up every symbol. */
const canonicalSpellings = new Map(Object.entries(symbolAliases).flatMap(([key, spellings]) => spellings.map(spelling => [spelling, key] as const)))

/** The canonical spelling of a symbol, for example `\\leq` for `≤`. Other symbols stay unchanged. */
export function canonicalSymbol(value: string): string {
  return canonicalSpellings.get(value) ?? value
}

/** Maps every alias of a key, for example `\leq`, `\le`, `≤`, and `<=`, to one value. */
export function aliases<T>(entries: Record<string, T>): Record<string, T> {
  const result: Record<string, T> = {}
  for (const [key, value] of Object.entries(entries)) {
    for (const alias of symbolAliases[key] ?? [key])
      result[alias] = value
  }
  return result
}

/** Korean particles change with the last sound of the word before them. */
const finalConsonantLetters = new Set('lmnr'.split(''))
// 0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔 end in a consonant. 10 십, 100 백, 1000 천 and 10000 만 do too.
const finalConsonantDigits = new Set('013678'.split(''))
const hangulStart = 0xAC00
const hangulEnd = 0xD7A3

function finalConsonant(word: string): 'none' | 'rieul' | 'other' {
  const last = word.trim().at(-1) ?? ''
  const code = last.codePointAt(0) ?? 0
  if (code >= hangulStart && code <= hangulEnd) {
    const jong = (code - hangulStart) % 28
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other'
  }
  if (/\d/.test(last)) {
    if (last === '1' || last === '7' || last === '8')
      return 'rieul'
    return finalConsonantDigits.has(last) || /\d0$/.test(word.trim()) ? 'other' : 'none'
  }
  if (finalConsonantLetters.has(last.toLowerCase()))
    return last.toLowerCase() === 'l' || last.toLowerCase() === 'r' ? 'rieul' : 'other'
  return 'none'
}

/** Appends the Korean particle that fits the word, for example 극한은 and 파이는. */
export function josa(word: string, withConsonant: string, withVowel: string): string {
  const sound = finalConsonant(word)
  // 로 also follows a final ㄹ.
  if (withVowel === '로')
    return `${word}${sound === 'other' ? withConsonant : withVowel}`
  return `${word}${sound === 'none' ? withVowel : withConsonant}`
}

/** Names a Latin letter from a table. Other characters stay unchanged. */
export function letterName(names: readonly string[], letter: string): string {
  const index = letter.toUpperCase().charCodeAt(0) - 65
  return letter.length === 1 && index >= 0 && index < 26 ? names[index]! : letter
}

/** Adds a power word to a denominator unit, for example 平方 before 秒. */
export function unitPower(power: string | undefined, words: { 2: string, 3: string }): string {
  return power === '2' ? words[2] : power === '3' ? words[3] : ''
}
