import type { MathJson } from '@proj-airi/mathjson'

import type { RenderHandlers } from './extension'
import type { FractionPart, FractionShape, MathLocale } from './locale'

import { argsOf, headOf, isFunction, isNumber, isSymbol, isText, nothing, textOf } from '@proj-airi/mathjson'

import { operatorHeads, rawHead, relationHeads } from './heads'
import { greekNames } from './locale'
import { speakUnit } from './units'

const relationKeys: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(relationHeads).map(([key, head]) => [head, key]))
const operatorKeys: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(operatorHeads).map(([key, head]) => [head, key]))
const unarySigns: Readonly<Record<string, string>> = { Negate: '-', Positive: '+', PlusMinus: '\\pm', MinusPlus: '\\mp' }
const infinities = new Set(['\\infty', '∞'])
const latinLetter = /^[a-z]$/i
/** A Greek letter command, for example `\omega` or `\Omega`. Its lowercase name is the key of its case pair. */
const greekCommand = /^\\([a-z]+)$/i
/** The names of Greek letters. A subscript number under them reads without a subscript word, as `\\theta_0`. */
const greekLetters: ReadonlySet<string> = new Set(greekNames)
const binaryHeads = new Set(Object.values(operatorHeads))
const bigOperatorKinds: Readonly<Record<string, 'sum' | 'prod' | 'int' | 'union' | 'intersection'>> = { Sum: 'sum', Product: 'prod', Integrate: 'int', BigUnion: 'union', BigIntersection: 'intersection' }
const ellipses = new Set(['\\cdots', '\\ldots', '\\dots', '…'])

/** The case-pair key of a letter: `n` for `n` and `N`, `omega` for `\omega` and `\Omega`. Other symbols have none. */
function caseKey(value: string): string | undefined {
  if (latinLetter.test(value))
    return value.toLowerCase()
  const greek = greekCommand.exec(value)
  return greek ? greek[1]!.toLowerCase() : undefined
}

function isUpperCase(value: string): boolean {
  const letter = value.startsWith('\\') ? value[1]! : value
  return letter !== letter.toLowerCase()
}

/** Every symbol of an expression, also the letters of a name. */
function symbolsOf(expression: MathJson): string[] {
  if (isSymbol(expression))
    return [expression]
  if (!isFunction(expression))
    return []
  return argsOf(expression).flatMap(symbolsOf)
}

/** The letters that an expression uses in both cases, for example `n` in `N = n + 1`. Speech has no case, so only these say it. */
function mixedCaseKeys(expression: MathJson): Set<string> {
  const seen = new Map<string, Set<boolean>>()
  for (const value of symbolsOf(expression)) {
    const key = caseKey(value)
    if (key !== undefined)
      seen.set(key, (seen.get(key) ?? new Set()).add(isUpperCase(value)))
  }
  return new Set([...seen].filter(([, cases]) => cases.size === 2).map(([key]) => key))
}

function contains(expression: MathJson, test: (value: MathJson) => boolean): boolean {
  return test(expression) || (isFunction(expression) && argsOf(expression).some(argument => contains(argument, test)))
}

/** True when an expression has a binary operator at any depth, as the sum in `n(n+1)`. */
function hasOperator(expression: MathJson): boolean {
  return contains(expression, value => binaryHeads.has(headOf(value) ?? '') && argsOf(value).length >= 2)
}

/** How hard a part of a fraction is to hear, see {@link FractionPart}. */
function fractionPart(expression: MathJson): FractionPart {
  const head = headOf(expression)
  if (head === undefined)
    return 'simple'
  if ((binaryHeads.has(head) && argsOf(expression).length >= 2) || relationKeys[head] !== undefined || head === 'Divide' || head === 'Clauses')
    return 'compound'
  if (head === 'Negate' || head === 'Positive')
    return fractionPart(argsOf(expression)[0] ?? nothing)
  if ((head === 'Group' || head === 'Delimiter') && hasOperator(expression))
    return 'compound'
  if (head === 'Power' || head === 'Subscript' || head === 'Degrees' || head === 'Prime' || head === 'Complement')
    return 'scripted'
  if (head === 'InvisibleOperator') {
    const parts = argsOf(expression).map(fractionPart)
    if (parts.includes('compound'))
      return 'compound'
    return parts.includes('scripted') ? 'scripted' : 'simple'
  }
  return 'simple'
}

/** Splits `b (mod n)` into `b` and `n`, or returns undefined when the expression does not end with a modulus. */
function trailingModulus(value: MathJson): { rest: MathJson, modulus: MathJson } | undefined {
  if (headOf(value) === 'Modulo')
    return { rest: nothing, modulus: argsOf(value)[0] ?? nothing }
  if (headOf(value) !== 'InvisibleOperator')
    return undefined
  const args = argsOf(value)
  const last = args.at(-1)
  if (headOf(last) !== 'Modulo')
    return undefined
  const rest = args.slice(0, -1)
  return { rest: rest.length === 1 ? rest[0]! : ['InvisibleOperator', ...rest], modulus: argsOf(last!)[0] ?? nothing }
}

/**
 * Reads lowered MathJSON aloud with one locale pack.
 *
 * It decides only the words: each head maps to an entry of the pack. What the notation means was decided by
 * lowering, see ./lower.
 *
 * `handlers` read the heads of extensions, for example `Chemistry`. A handler wins over a built-in head.
 */
export function renderMath(expression: MathJson, lexicon: MathLocale, handlers: RenderHandlers = {}): string {
  const mixedCase = mixedCaseKeys(expression)

  function word(value: string): string {
    const known = lexicon.words[value]
    // An operator without operands, as in `1 +`, keeps its operator word. A word wins, so `\triangle` is the shape.
    if (known === undefined && operatorHeads[value] !== undefined)
      return lexicon.operators[value] ?? value
    let spoken: string
    if (known !== undefined)
      spoken = known
    else if (latinLetter.test(value))
      spoken = lexicon.letter(value)
    else
      spoken = value.startsWith('\\') ? value.slice(1) : value
    const key = caseKey(value)
    if (key === undefined)
      return spoken
    // A letter says its case only when the formula has both cases of it, as in `a \in A`. A lone `\Sigma` or `N` is
    // clear, and its case words only make the reading longer. The grader folds case in that formula too.
    return mixedCase.has(key) ? lexicon.letterCase(spoken, isUpperCase(value)) : spoken
  }

  /** Reads text, with any TeX command inside it as a word. */
  function plain(value: string): string {
    return value.replace(/\\[a-z]+/gi, match => word(match)).replace(/[{}\\]/g, '').trim()
  }

  function optional(value: MathJson | undefined): string | undefined {
    return value === undefined || value === nothing ? undefined : render(value)
  }

  /** Reads a condition list, as in `t \sim U, x \sim p`, with the list joiner, even when its items are clauses. */
  function renderList(value: MathJson): string {
    const head = headOf(value)
    return head === 'Clauses' || head === 'Sequence' ? lexicon.list(argsOf(value).map(item => render(item))) : render(value)
  }

  /**
   * Reads a group of two simple terms with the words of the pack, for example a 与 b 的和, or returns undefined. A
   * compound term inside, as in `(a+b+c)`, keeps the brackets: a 与 b 的和与 c 的和 is harder to hear than brackets.
   */
  function groupWords(inner: MathJson): string | undefined {
    const head = headOf(inner)
    const words = head === 'Add' ? lexicon.groupOf?.sum : head === 'Subtract' ? lexicon.groupOf?.difference : undefined
    const [left = nothing, right = nothing] = argsOf(inner)
    // A fraction is one term, so `(1+\\frac{1}{n})` reads as 1 与 n 分之 1 的和.
    const compound = (term: MathJson) => fractionPart(term) === 'compound' && headOf(term) !== 'Divide'
    if (!words || argsOf(inner).length !== 2 || compound(left) || compound(right))
      return undefined
    return words(render(left), render(right))
  }

  /** `\\|\\cdot\\|` names the norm itself, so its empty slot is not read: "the norm", not "the norm of dot". */
  function normArgument(inner: MathJson): string {
    if (headOf(inner) === 'Subtract' && argsOf(inner).length === 2 && lexicon.normDifference)
      return lexicon.normDifference(render(argsOf(inner)[0]!), render(argsOf(inner)[1]!, true))
    return headOf(inner) === 'Placeholder' ? '' : render(inner)
  }

  /** Reads the items of a list or a tuple. `k = 1, \dots, d` ends at d: "one, and so on, up to d". */
  function renderItems(items: readonly MathJson[]): string[] {
    const ellipsisBeforeLast = items.length >= 3 && ellipses.has(String(items.at(-2)))
    if (ellipsisBeforeLast && lexicon.range) {
      // `x_1, x_2, \dots, x_n` reads as x_1, then x_2 to x_n: the item before the ellipsis starts the range.
      const spoken = items.slice(0, -3).map(item => render(item))
      return [...spoken, lexicon.range(render(items.at(-3)!), render(items.at(-1)!))]
    }
    return items.map((item, position) => ellipsisBeforeLast && position === items.length - 1 ? lexicon.upTo(render(item)) : render(item))
  }

  /** `afterOperator` is true when an operator comes right before the expression, so a fraction can name its parts. */
  function render(value: MathJson, afterOperator = false): string {
    if (isNumber(value))
      return lexicon.number(value.num)
    if (value === nothing)
      return ''
    if (isText(value))
      return plain(textOf(value))
    if (typeof value === 'string')
      return word(value)

    const [head, ...args] = value
    const [first = nothing, second = nothing, third = nothing] = args

    const handler = handlers[head]
    if (handler)
      return handler(value, { lexicon, render: argument => render(argument) })

    const relation = relationKeys[head]
    if (relation !== undefined && lexicon.chain && relationKeys[headOf(first) ?? ''] !== undefined) {
      // Lowering nests a chain on the left: `a < b < c` is `Less(Less(a, b), c)`. A pack whose relations wrap their
      // operands, as Korean 에이는 비보다 작음, cannot nest them, so it gets the operands and relations in order.
      const operands: MathJson[] = []
      const relations: string[] = []
      let link: MathJson = value
      while (relationKeys[headOf(link) ?? ''] !== undefined) {
        const [left = nothing, right = nothing] = argsOf(link)
        operands.unshift(right)
        relations.unshift(relationKeys[headOf(link)!]!)
        link = left
      }
      operands.unshift(link)
      return lexicon.chain(
        operands.map(operand => ellipses.has(String(operand)) ? undefined : render(operand)),
        relations.map(key => lexicon.relations[key]!),
      ).trim()
    }
    // `a \equiv b \pmod{n}` is a congruence. Its modulus ends the right side, after `b`.
    const modulus = head === 'Equivalent' ? trailingModulus(second) : undefined
    if (modulus !== undefined)
      return lexicon.congruent(render(first), render(modulus.rest), render(modulus.modulus)).trim()
    if (relation !== undefined)
      return lexicon.relations[relation]!(render(first), render(second)).trim()

    const unary = unarySigns[head]
    if (unary !== undefined && args.length === 1) {
      const sign = unary === '-' ? lexicon.negative : unary === '+' ? lexicon.positive : lexicon.operators[unary]!
      return lexicon.join([sign, render(first, true)])
    }
    if (unary !== undefined && args.length === 0)
      return unary === '-' ? lexicon.negative : unary === '+' ? lexicon.positive : lexicon.operators[unary]!

    const operator = operatorKeys[head]
    if (operator !== undefined && args.length === 2)
      return lexicon.join([render(first), lexicon.operators[operator]!, render(second, true)])

    switch (head) {
      case 'Clauses':
        return lexicon.clauses(args.map(argument => render(argument)))
      case 'Mapping':
        return lexicon.mapping(render(first), render(second), render(third))
      case 'InvisibleOperator': {
        const parts = args.map(argument => render(argument))
        // A spoken group has a start word but no end word, so "the quantity one minus t epsilon" for `(1-t)\epsilon` can
        // be heard as `(1 - t\epsilon)`. The times word after a group ends it. In a pack with group words, as Chinese
        // n 与 1 的和 for `n(n+1)`, the group has no start word either, so the times word also comes before it.
        const isGroup = (value: MathJson) => headOf(value) === 'Group'
        const wordGroup = (value: MathJson) => isGroup(value) && lexicon.groupOf !== undefined && groupWords(argsOf(value)[0] ?? nothing) !== undefined
        return lexicon.join(parts.flatMap((part, position) => {
          if (position === 0)
            return [part]
          const previous = args[position - 1]!
          // "one millimeter", not "one millimeters".
          if (headOf(args[position]!) === 'Unit' && isNumber(previous) && previous.num === '1' && lexicon.units.singular)
            return [lexicon.units.singular(part)]
          // A fraction has no end word either: "seven over sixty k" can be heard as 7/(60k).
          return isGroup(previous) || headOf(previous) === 'Divide' || wordGroup(args[position]!) ? [lexicon.groupTimes ?? lexicon.operators['\\times']!, part] : [part]
        }))
      }
      case 'Name':
        return lexicon.join(args.map(argument => render(argument)))
      // The rows of `aligned` are statements, so each one is a clause.
      case 'Rows':
        return lexicon.clauses(args.map(argument => render(argument)))
      case 'Cases':
        return lexicon.cases(args.map((item) => {
          const [value = nothing, condition] = argsOf(item)
          return { value: render(value), condition: condition === undefined ? undefined : render(condition) }
        }))
      case 'Matrix':
      case 'Determinant':
        return lexicon.matrix(args.map(row => argsOf(row).map(cell => render(cell))), head === 'Determinant')
      case 'Sequence':
        return lexicon.list(renderItems(args))
      case 'Apply': {
        // `["Apply", f, ...arguments]`. A call with more than one argument, or with a sum or a relation in its only
        // argument, says its parentheses, so `f(x+1)` is not heard as `f(x) + 1`.
        const callArgs = args.slice(1)
        const grouped = callArgs.length > 1 || (callArgs.length === 1 && fractionPart(callArgs[0]!) === 'compound')
        // A name with a subscript is decorated too: Japanese キュー下付きエムティー for `q_m(t)` runs the subscript into the
        // argument, so the listener cannot tell where the name ends.
        const decorated = headOf(first) === 'Accent' || headOf(first) === 'Name' || headOf(first) === 'NumberSet' || headOf(first) === 'Subscript' || headOf(first) === 'Inverse'
        return lexicon.apply(render(first), callArgs.map(argument => render(argument)), grouped, decorated)
      }
      case 'Norm':
        return lexicon.norm(normArgument(first), optional(args[1]), false)
      case 'Expectation':
      case 'Probability':
      case 'Variance':
      case 'Covariance':
        // `[head, body, condition?]`. A list of conditions, as in `t \sim U, x \sim p_t`, reads as one list.
        return lexicon.statistic(head, render(first), args[1] === undefined ? undefined : renderList(args[1]))
      case 'About':
        return lexicon.about(render(first))
      case 'Distributed':
        return lexicon.distributed(render(first), render(second))
      case 'Arrow':
        return lexicon.arrow(render(first), render(second))
      case 'Ceil':
        return lexicon.ceil(render(first))
      case 'Floor':
        return lexicon.floor(render(first))
      case 'Bracket':
        return lexicon.bracket(render(first))
      case 'Placeholder':
        return lexicon.placeholder
      case 'Superscript': {
        if (typeof second === 'string' && lexicon.marks[second] !== undefined)
          return lexicon.join([render(first), lexicon.marks[second]!])
        // `["Superscript", base, mark]`, where `["Delimiter", label]` is a label in parentheses, as in `f^{(n)}`.
        const parenthesized = headOf(second) === 'Delimiter'
        return lexicon.superscript(render(first), render(parenthesized ? argsOf(second)[0] ?? nothing : second), parenthesized)
      }
      case 'Text':
        return plain(textOf(first))
      case 'Unit': {
        const numerator = textOf(first)
        if (second === nothing)
          return speakUnit(numerator, lexicon.units) ?? plain(numerator)
        // `s^{-1}` has no numerator: "per second".
        const top = numerator ? speakUnit(numerator, lexicon.units) : ''
        // A unit after "per" can have its own word, as Japanese 時 in 毎時, and is singular, as "meters per second".
        const units = lexicon.units
        const bottomWords = textOf(second).split(' ').map(symbol => units.denominators?.[symbol] ?? speakUnit(symbol, units))
        const bottom = bottomWords.every(word => word !== undefined) ? (units.joinFactors ?? (words => words.join(' ')))(bottomWords.map(word => units.singular?.(word!) ?? word!)) : undefined
        if (top !== undefined && bottom)
          return lexicon.unitRatio(top, bottom, isNumber(third) ? third.num : undefined).trim()
        return plain(`${numerator}/${textOf(second)}${isNumber(third) ? `^${third.num}` : ''}`)
      }
      case 'Celsius':
        return lexicon.celsius(render(first))
      // A raw command that no extension lowered keeps the words of its source.
      case rawHead:
        return plain(textOf(second))
      case 'Divide': {
        const numericDenominator = isNumber(second)
        const shape: FractionShape = { numerator: fractionPart(first), denominator: fractionPart(second), followsOperator: afterOperator && !numericDenominator }
        return lexicon.fraction(render(first), render(second), shape)
      }
      case 'D':
        return lexicon.derivative(render(second), render(first), isNumber(third) ? third.num : undefined)
      case 'Binomial':
        return lexicon.binomial(render(first), render(second))
      case 'Ordinal':
        return lexicon.ordinal(render(first))
      case 'Given':
        return lexicon.given(render(first), render(second))
      case 'Modulo':
        return lexicon.modulo(render(first))
      case 'Inverse':
        return lexicon.inverse(render(first))
      case 'Sqrt':
        return lexicon.root(render(first), undefined, fractionPart(first) === 'compound')
      case 'Root':
        return lexicon.root(render(first), render(second))
      case 'Power': {
        if (headOf(first) === 'Group' && isNumber(second) && second.num === '2' && lexicon.squareOf)
          return lexicon.squareOf(render(first))
        if (headOf(first) === 'Abs' && isNumber(second) && second.num === '2' && lexicon.absoluteSquared)
          return lexicon.absoluteSquared(render(argsOf(first)[0] ?? nothing))
        if (headOf(first) === 'Norm' && isNumber(second) && second.num === '2') {
          const [inner = nothing, index] = argsOf(first)
          return lexicon.norm(normArgument(inner), optional(index), true)
        }
        const base = render(first)
        if (isNumber(second) && second.num === '2')
          return lexicon.squared(base)
        if (isNumber(second) && second.num === '3')
          return lexicon.cubed(base)
        return lexicon.power(base, render(second))
      }
      case 'Subscript': {
        const base = render(first)
        // A number under a letter is said after it, as a teacher says x zero for `x_0`. A letter under a letter keeps the
        // subscript word, because x t would sound like the product `x t`.
        if (isNumber(second) && isSymbol(first) && (latinLetter.test(first) || greekLetters.has(first.slice(1).toLowerCase())))
          return lexicon.numberIndex(base, render(second))
        // One symbol or number is an index, as in `x_1`. A longer subscript names its bounds, as in `x_{i+1}`.
        return isSymbol(second) || isNumber(second) || headOf(second) === 'Text' ? lexicon.index(base, render(second)) : lexicon.subscript(base, render(second))
      }
      case 'Degrees':
        return lexicon.degrees(render(first))
      case 'Prime':
        return lexicon.prime(render(first))
      case 'Factorial':
        return lexicon.join([render(first), lexicon.operators['!']!])
      case 'Percent':
        return lexicon.percent(render(first))
      case 'Complement':
        return lexicon.complement(render(first), optional(args[1]))
      case 'PowerSet':
        return lexicon.powerSet(render(first))
      case 'Cardinality':
        return lexicon.cardinality(render(first))
      case 'Abs':
        return lexicon.absolute(render(first))
      case 'Tuple':
        return lexicon.tuple(renderItems(args))
      case 'Set': {
        const condition = headOf(second) === 'Condition' ? argsOf(second)[0] : undefined
        return condition === undefined ? lexicon.set(render(first)) : lexicon.set(render(first), render(condition))
      }
      case 'Interval': {
        const open = (bound: MathJson) => headOf(bound) === 'Open'
        const inner = (bound: MathJson) => open(bound) ? argsOf(bound)[0] ?? nothing : bound
        return lexicon.interval(render(inner(first)), render(inner(second)), { left: !open(first), right: !open(second) })
      }
      case 'Group':
        return groupWords(first) ?? lexicon.quantity(render(first))
      case 'Delimiter':
        return render(first)
      case 'NumberSet': {
        const letter = isSymbol(first) ? first : undefined
        return (letter && lexicon.numberSets[letter]) ?? render(first)
      }
      case 'Segment':
        return lexicon.segment(lexicon.join(args.map(argument => render(argument))))
      case 'Arc':
        return lexicon.accent.overarc!(render(first))
      case 'Accent': {
        const accent = lexicon.accent[textOf(first)]
        const inner = render(second)
        return accent ? accent(inner) : inner
      }
      case 'Limit': {
        const bounds = second
        if (headOf(bounds) === 'Bounds') {
          const [variable = nothing, target = nothing, side] = argsOf(bounds)
          const direction = isNumber(side) ? (side.num === '1' ? 'right' : 'left') : undefined
          return lexicon.limit(render(first), render(variable), render(target), undefined, direction)
        }
        if (headOf(bounds) === 'Condition')
          return lexicon.limit(render(first), undefined, undefined, render(argsOf(bounds)[0] ?? nothing))
        return lexicon.limit(render(first))
      }
      case 'Sum':
      case 'Product':
      case 'Integrate':
      case 'BigUnion':
      case 'BigIntersection': {
        const kind = bigOperatorKinds[head]!
        const bounds = second
        const body = render(first)
        if (headOf(bounds) === 'Bounds') {
          const [variable = nothing, from = nothing, to = nothing] = argsOf(bounds)
          const improper = kind === 'int' && (contains(from, item => isSymbol(item) && infinities.has(item)) || contains(to, item => isSymbol(item) && infinities.has(item)))
          return lexicon.bigOperator(kind, body, { variable: optional(variable), from: optional(from), to: optional(to), improper })
        }
        if (headOf(bounds) === 'Condition') {
          const [condition, to] = argsOf(bounds)
          return lexicon.bigOperator(kind, body, { condition: optional(condition), to: optional(to) })
        }
        return lexicon.bigOperator(kind, body, {})
      }
      default:
        return lexicon.join(args.map(argument => render(argument)))
    }
  }

  return render(expression).replace(/\s+/g, ' ').trim()
}
