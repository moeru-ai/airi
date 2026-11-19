import type { MathLocale, Relation } from '../locale'

import { aliases, greek, greekNames, joinSpaced } from '../locale'
import { spellNumber } from '../numbers'

/** Ordinal words of a derivative order. Other orders add -th to the spelled number. */
const ordinals: Readonly<Record<string, string>> = { 2: 'second', 3: 'third' }

/** Ordinal words of a root degree, after the number is spelled. */
const rootOrdinals: Readonly<Record<string, string>> = { four: 'fourth', five: 'fifth', six: 'sixth', seven: 'seventh', eight: 'eighth', nine: 'ninth', ten: 'tenth' }

export const en: MathLocale = {
  language: 'en',
  join: joinSpaced,
  number: digits => spellNumber(digits, 'en'),
  letter: letter => letter,
  // Only the capital says its case: "k from one to capital K" is clear, and "lowercase" on every k is heavy.
  letterCase: (spoken, upper) => upper ? `capital ${spoken}` : spoken,
  clauses: parts => parts.join(', '),
  cases: items => items.map(({ value, condition }) => condition === undefined ? `${value} otherwise` : `${value} if ${condition}`).join(', '),
  matrix: (rows, determinant) => `the ${determinant ? 'determinant' : 'matrix'} with ${rows.map((row, index) => `row ${spellNumber(String(index + 1), 'en')}: ${row.join(', ')}`).join('; ')}`,
  list: items => items.join(', '),
  words: {
    ...greek(greekNames.map(name => name.replace(/^var/, ''))),
    '\\nabla': 'nabla',
    '∇': 'nabla',
    // `\varsigma` is another letter, the final sigma, not a variant glyph as `\varphi` is.
    '\\varsigma': 'final sigma',
    'M_\\odot': 'solar masses',
    'L_\\odot': 'solar luminosities',
    'R_\\odot': 'solar radii',
    '\\checkmark': 'check mark',
    // Between two operands, `\frown` is the cap product of topology. Over letters it is an arc, see ../lower.
    '\\frown': 'cap product',
    '\\ast': 'star',
    '\\infty': 'infinity',
    '∞': 'infinity',
    '\\angle': 'angle',
    '∠': 'angle',
    '\\triangle': 'triangle',
    '△': 'triangle',
    '\\odot': 'circle',
    '⊙': 'circle',
    '\\circ': 'degrees',
    '°': 'degrees',
    '\\cdots': 'and so on',
    '\\ldots': 'and so on',
    '\\dots': 'and so on',
    '…': 'and so on',
    '\\emptyset': 'the empty set',
    '\\varnothing': 'the empty set',
    '∅': 'the empty set',
    '\\forall': 'for all',
    '\\exists': 'there exists',
    '\\nexists': 'there does not exist',
    '∄': 'there does not exist',
    '\\aleph': 'aleph',
    'ℵ': 'aleph',
    '\\therefore': 'therefore',
    '\\because': 'because',
    '\\partial': 'partial',
    '\\sin': 'sine',
    '\\cos': 'cosine',
    '\\tan': 'tangent',
    '\\cot': 'cotangent',
    '\\sec': 'secant',
    '\\csc': 'cosecant',
    '\\log': 'log',
    '\\lg': 'log',
    '\\ln': 'natural log',
    '\\lim': 'limit',
    '\\max': 'max',
    '\\min': 'min',
    '\\mid': 'such that',
    '\\%': 'percent',
    '%': 'percent',
  },
  operators: aliases({ '+': 'plus', '-': 'minus', '\\times': 'times', '\\cdot': 'times', '\\div': 'divided by', '\\pm': 'plus or minus', '\\mp': 'minus or plus', '\\cup': 'union', '\\cap': 'intersection', '\\setminus': 'minus', '\\sqcup': 'disjoint union', '\\triangle': 'symmetric difference', '\\circ': 'composed with', '!': 'factorial' }),
  negative: 'negative',
  positive: 'positive',
  relations: aliases<Relation>({
    '=': (l, r) => `${l} equals ${r}`,
    '\\neq': (l, r) => `${l} is not equal to ${r}`,
    '<': (l, r) => `${l} is less than ${r}`,
    '>': (l, r) => `${l} is greater than ${r}`,
    '\\ll': (l, r) => `${l} is much less than ${r}`,
    '\\gg': (l, r) => `${l} is much greater than ${r}`,
    '\\leq': (l, r) => `${l} is less than or equal to ${r}`,
    '\\geq': (l, r) => `${l} is greater than or equal to ${r}`,
    '\\approx': (l, r) => `${l} is approximately equal to ${r}`,
    '\\equiv': (l, r) => `${l} is equivalent to ${r}`,
    '\\perp': (l, r) => `${l} is perpendicular to ${r}`,
    '\\parallel': (l, r) => `${l} is parallel to ${r}`,
    '\\in': (l, r) => `${l} is an element of ${r}`,
    '\\notin': (l, r) => `${l} is not an element of ${r}`,
    '\\ni': (l, r) => `${l} contains ${r}`,
    // `\subseteq` says "or equal to", because a listener writes a plain "subset" as `\subset`.
    '\\subseteq': (l, r) => `${l} is a subset of or equal to ${r}`,
    '\\subset': (l, r) => `${l} is a proper subset of ${r}`,
    '\\supseteq': (l, r) => `${l} is a superset of or equal to ${r}`,
    '\\supset': (l, r) => `${l} is a proper superset of ${r}`,
    '\\nsubseteq': (l, r) => `${l} is not a subset of ${r}`,
    '\\nsupseteq': (l, r) => `${l} is not a superset of ${r}`,
    '\\sim': (l, r) => `${l} is similar to ${r}`,
    '\\cong': (l, r) => `${l} is congruent to ${r}`,
    '\\to': (l, r) => `${l} approaches ${r}`,
    '\\mapsto': (l, r) => `${l} maps to ${r}`,
    '\\Rightarrow': (l, r) => `${l} implies ${r}`,
    '\\Leftrightarrow': (l, r) => `${l} if and only if ${r}`,
    '\\propto': (l, r) => `${l} is proportional to ${r}`,
    '\\gtrsim': (l, r) => `${l} is greater than or approximately ${r}`,
    '\\lesssim': (l, r) => `${l} is less than or approximately ${r}`,
    '\\mid': (l, r) => `${l} divides ${r}`,
    '\\nmid': (l, r) => `${l} does not divide ${r}`,
    '\\vdash': (l, r) => `${l} proves ${r}`,
    '\\coloneqq': (l, r) => `${l} is defined as ${r}`,
  }),
  // The numerator comes first, so a power on the denominator can bind to the whole fraction: 6 over pi squared.
  fraction: (n, d, shape) => shape.numerator === 'compound' || shape.denominator === 'compound' || shape.denominator === 'scripted'
    ? `the fraction with numerator ${n} and denominator ${d}`
    : `${n} over ${d}`,
  derivative: (v, body, order) => `the ${order ? `${ordinals[order] ?? `${spellNumber(order, 'en')}th`} ` : ''}derivative with respect to ${v} of ${body}`,
  power: (b, e) => `${b} to the power of ${e}`,
  squared: b => `${b} squared`,
  cubed: b => `${b} cubed`,
  degrees: b => `${b} degrees`,
  prime: b => `${b} prime`,
  // A presenter says "theta star", "P n", and "G p". The word superscript names the layout, not the meaning.
  superscript: (b, m) => `${b} ${m}`,
  marks: { '\\ast': 'star', '\\dagger': 'dagger', '\\vee': 'dual' },
  // "of" marks the call, so `f(x)` is not heard as the product `f x`.
  apply: (f, args, grouped) => grouped && args.length === 1 ? `${f} of the quantity ${args[0]}` : `${f} of ${args.join(', ')}`,
  upTo: x => `up to ${x}`,
  placeholder: 'dot',
  numberIndex: (b, i) => `${b} ${i}`,
  index: (b, i) => `${b} sub ${i}`,
  subscript: (b, s) => `${b} sub ${s}`,
  ordinal: value => `${value}-th`,
  given: (event, condition) => `${event} given ${condition}`,
  modulo: m => `modulo ${m}`,
  congruent: (l, r, m) => `${l} is congruent to ${r} modulo ${m}`,
  inverse: name => `${name} inverse`,
  root: (x, n) => {
    if (n === undefined)
      return `the square root of ${x}`
    if (n === 'three')
      return `the cube root of ${x}`
    // A letter takes an ordinal suffix, as in the n-th root. A spelled number takes its ordinal word, as the fourth root.
    if (/^[a-z]$/i.test(n))
      return `the ${n}th root of ${x}`
    return rootOrdinals[n] ? `the ${rootOrdinals[n]} root of ${x}` : `the root of degree ${n} of ${x}`
  },
  limit: (body, v, t, c, side) => {
    if (v !== undefined && t !== undefined)
      return `the limit as ${v} approaches ${t}${side ? ` from the ${side}` : ''} of ${body}`
    return c ? `the limit over ${c} of ${body}` : `the limit of ${body}`
  },
  normDifference: (left, right) => `the difference between ${left} and ${right}`,
  norm: (x, index, squared) => `the ${squared ? 'squared ' : ''}${index ? `${index}-norm` : 'norm'}${x ? ` of ${x}` : ''}`,
  statistic: (kind, body, condition) => {
    const noun = { Expectation: 'the expected value', Probability: 'the probability', Variance: 'the variance', Covariance: 'the covariance' }[kind]
    return condition ? `${noun}, over ${condition}, of ${body}` : `${noun} of ${body}`
  },
  about: x => `about ${x}`,
  distributed: (x, d) => `${x} drawn from ${d}`,
  arrow: (l, r) => `${l} to ${r}`,
  ceil: x => `the ceiling of ${x}`,
  floor: x => `the floor of ${x}`,
  tuple: items => `${items.length === 2 ? 'the pair' : 'the tuple'} ${items.join(', ')}`,
  squareOf: x => `the square of ${x}`,
  absoluteSquared: x => `the squared absolute value of ${x}`,
  bracket: x => `open bracket ${x} close bracket`,
  mapping: (f, from, to) => `${f} is a function from ${from} to ${to}`,
  bigOperator: (kind, body, { variable, from, to, condition, improper }) => {
    const noun = { sum: 'the sum', prod: 'the product', int: improper ? 'the improper integral' : 'the integral', union: 'the union', intersection: 'the intersection' }[kind]
    if (kind === 'int')
      return from !== undefined || to !== undefined ? `${noun} from ${from ?? ''} to ${to ?? ''} of ${body}` : `${noun} of ${body}`
    if (variable !== undefined && from !== undefined)
      return `${noun} from ${variable} equals ${from} to ${to ?? 'infinity'} of ${body}`
    return condition ? `${noun} over ${condition} of ${body}` : `${noun} of ${body}`
  },
  absolute: x => `the absolute value of ${x}`,
  quantity: x => `the quantity ${x}`,
  set: (x, c) => c ? `the set of ${x} such that ${c}` : `the set ${x}`,
  interval: (a, b, { left, right }) => left === right
    ? `the ${left ? 'closed' : 'open'} interval from ${a} to ${b}`
    : `the interval from ${a} ${left ? 'inclusive' : 'exclusive'} to ${b} ${right ? 'inclusive' : 'exclusive'}`,
  complement: (set, universe) => universe ? `the complement of ${set} in ${universe}` : `the complement of ${set}`,
  powerSet: set => `the power set of ${set}`,
  cardinality: set => `the number of elements of ${set}`,
  percent: n => `${n} percent`,
  accent: {
    ket: b => `ket ${b}`,
    bra: b => `bra ${b}`,
    overline: b => `${b} bar`,
    bar: b => `${b} bar`,
    vec: b => `vector ${b}`,
    overrightarrow: b => `vector ${b}`,
    hat: b => `${b} hat`,
    widehat: b => `${b} hat`,
    tilde: b => `${b} tilde`,
    dot: b => `${b} dot`,
    overarc: b => `arc ${b}`,
    wideparen: b => `arc ${b}`,
  },
  segment: name => `segment ${name}`,
  binomial: (n, k) => `${n} choose ${k}`,
  // The denominator unit is singular: meters per second.
  unitRatio: (n, d, power) => `${n} per ${d}${power === '2' ? ' squared' : power === '3' ? ' cubed' : ''}`,
  celsius: value => `${value} degrees Celsius`,
  numberSets: { 'R': 'the real numbers', 'N': 'the natural numbers', 'Z': 'the integers', 'Q': 'the rational numbers', 'C': 'the complex numbers', 'N+': 'the positive integers', 'N*': 'the positive integers', 'Z+': 'the positive integers', 'Z-': 'the negative integers', 'Z*': 'the nonzero integers', 'R+': 'the positive real numbers', 'R-': 'the negative real numbers', 'R*': 'the nonzero real numbers', 'Q+': 'the positive rational numbers' },
  units: {
    prefixes: { Q: 'quetta', R: 'ronna', Y: 'yotta', Z: 'zetta', E: 'exa', P: 'peta', T: 'tera', G: 'giga', M: 'mega', k: 'kilo', h: 'hecto', da: 'deca', d: 'deci', c: 'centi', m: 'milli', µ: 'micro', n: 'nano', p: 'pico', f: 'femto', a: 'atto', z: 'zepto', y: 'yocto', r: 'ronto', q: 'quecto' },
    units: { m: 'meters', g: 'grams', s: 'seconds', A: 'amperes', K: 'kelvins', mol: 'moles', cd: 'candelas', Hz: 'hertz', N: 'newtons', Pa: 'pascals', J: 'joules', W: 'watts', C: 'coulombs', V: 'volts', F: 'farads', Ω: 'ohms', S: 'siemens', Wb: 'webers', T: 'teslas', H: 'henries', lm: 'lumens', lx: 'lux', Bq: 'becquerels', Gy: 'grays', Sv: 'sieverts', kat: 'katals', L: 'liters', l: 'liters', t: 'tonnes', eV: 'electronvolts', Da: 'daltons', bar: 'bars', B: 'bytes', bit: 'bits', cal: 'calories' },
    plain: { min: 'minutes', h: 'hours', d: 'days', ha: 'hectares', au: 'astronomical units', Å: 'angstroms', atm: 'atmospheres', Rt: 'right', dB: 'decibels', ft: 'feet', mi: 'miles' },
    power: (words, power) => `${power === '2' ? 'square' : 'cubic'} ${words}`,
    singular: words => words === 'feet' ? 'foot' : words.endsWith('ies') ? `${words.slice(0, -3)}y` : /(?:hertz|siemens|lux)$/.test(words) || !words.endsWith('s') ? words : words.slice(0, -1),
  },
}
