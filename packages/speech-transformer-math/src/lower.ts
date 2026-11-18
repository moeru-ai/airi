import type { MathJson } from '@proj-airi/mathjson'

import type { TexNode } from './tex'

import { argsOf, headOf, isFunction, isNumber, nothing, text } from '@proj-airi/mathjson'

import { operatorHeads, rawHead, relationHeads } from './heads'
import { canonicalSymbol, greekNames } from './locale'

const multiplicative = new Set(['Multiply', 'InlineDivide'])
/** Signs that can start an operand, as in `-1` or `\pm b`. */
const unaryHeads: Readonly<Record<string, string>> = { '+': 'Positive', '-': 'Negate', '\\pm': 'PlusMinus', '\\mp': 'MinusPlus' }

const smallSetOperators: Readonly<Record<string, BigHead>> = { '\\cap': 'BigIntersection', '∩': 'BigIntersection', '\\cup': 'BigUnion', '∪': 'BigUnion' }

const bigOperators: Readonly<Record<string, BigHead>> = {
  '\\lim': 'Limit',
  '\\sum': 'Sum',
  '∑': 'Sum',
  '\\prod': 'Product',
  '∏': 'Product',
  '\\int': 'Integrate',
  '∫': 'Integrate',
  '\\iint': 'Integrate',
  '\\oint': 'Integrate',
  '\\bigcup': 'BigUnion',
  '⋃': 'BigUnion',
  '\\bigcap': 'BigIntersection',
  '⋂': 'BigIntersection',
}

/** The heads of operators that take the rest of the operand, with bounds below and above. */
type BigHead = 'Limit' | 'Sum' | 'Product' | 'Integrate' | 'BigUnion' | 'BigIntersection'

/** Symbols that only group or separate. Unpaired delimiters land here too. */
const silent = new Set(['(', ')', '[', ']', '|', '\\{', '\\}', '\\lbrace', '\\rbrace', '\\langle', '\\rangle', '\\vert', '\\lvert', '\\rvert', '&', ',', ';', ':', '.', '\\colon'])
/** A separator starts a new operand, so a sign after it is unary, for example `-1` in `(0, -1)`. */
const separators = new Set([',', ';', '&'])
/**
 * Separators that split operands into a list, as in `r, s \in \Sigma` or `f(x; \theta)`. The items of a list are read
 * with a pause between them. Without the split, `r, s` would join as the product `r s`.
 * `&` is not here: it aligns columns, and an aligned equation is not a list.
 */
const listSeparators = new Set([',', ';'])
/** Between two operands, a triangle is the symmetric difference of two sets. Before an operand, it is the shape. */
const triangles = new Set(['\\triangle', '△', '\\bigtriangleup'])
const infinities = new Set(['\\infty', '∞'])
const setRelations = new Set(['\\in', '\\notin', '\\subseteq', '\\subset', '\\supseteq', '\\supset'])
const setOperators = new Set(['\\cup', '\\cap', '\\setminus'])
const complements = new Set(['\\complement', '∁'])
const degreeMarks = new Set(['\\circ', '°'])
const derivativeMarks = new Set(['d', '\\partial', '∂'])
const fractionCommands = new Set(['frac', 'dfrac', 'tfrac', 'cfrac'])
const binomialCommands = new Set(['binom', 'dbinom', 'tbinom'])
const arrows = new Set(['\\to', '\\rightarrow', '→', '\\longrightarrow'])
/** `A^c` is a complement only on a set name. On other bases, for example `x^c`, it is a power. */
const number = /^\d+(?:\.\d+)?$/
const upperLetter = /^[A-Z]$/
const latinLetter = /^[a-z]$/i
const digits = /^\d+$/
/** Greek letter commands in both cases, for example `\phi` and `\Phi`. */
const greekCommands = new Set(greekNames.flatMap(name => [`\\${name}`, `\\${name[0]!.toUpperCase()}${name.slice(1)}`]))
/**
 * Letters that name a function by convention, so `f(x+1)` is a call although its parentheses hold a sum.
 * Other letters before a sum in parentheses multiply it, as `n` in `n(n+1)`.
 */
const functionLetters = new Set(['f', 'g', 'h', 'p', 'q', 'u', 'v', 'w', 'F', 'G', 'H', 'L', 'P', 'Q', '\\phi', '\\varphi', '\\psi', '\\Phi', '\\Psi', '\\Gamma'])
/**
 * Function commands of TeX, as `\ln` or `\gcd`. Parentheses after them hold arguments, also with a sum inside:
 * `\ln(x+1)` is the log of x + 1, never `\ln` times x + 1.
 */
const functionCommands = new Set(['\\sin', '\\cos', '\\tan', '\\cot', '\\sec', '\\csc', '\\arcsin', '\\arccos', '\\arctan', '\\sinh', '\\cosh', '\\tanh', '\\coth', '\\ln', '\\log', '\\lg', '\\exp', '\\det', '\\gcd', '\\max', '\\min', '\\sup', '\\inf', '\\deg', '\\dim', '\\ker', '\\arg', '\\hom'])
/** Letters that upright text writes for a constant or a differential: `\mathrm{d}x`, `\mathrm{e}^x`, `\mathrm{i}`. */
const uprightLetters = new Set(['d', 'e', 'i'])
/** Superscripts that restrict a number set by sign, keyed to the suffix of the set name in `numberSets`. */
const signedSets: Readonly<Record<string, string>> = { '+': '+', '-': '-', '*': '*', '\\ast': '*' }
/** Constants that are never called: `e^{i\theta}(\cos\theta + i\sin\theta)` multiplies. */
const constants = new Set(['e', 'i', '\\pi'])
/** Accents that keep a letter a name, for example `\bar{x}(t)` or `\hat{f}(\xi)`. */
const accentCommands = new Set(['bar', 'hat', 'tilde', 'vec', 'dot', 'ddot', 'check', 'breve', 'overline', 'widehat', 'widetilde'])
/** A centered dot alone in an argument marks an empty slot, as in `p(\cdot)` or `\langle \cdot, \cdot \rangle`. */
const placeholderMarks = new Set(['\\cdot', '\\bullet', '·', '∙'])
/** Delimiters of a norm, as in `\|x\|`. */
const normDelimiters = new Set(['\\|', '\\Vert', '\\lVert', '‖'])
/** Font commands that keep a letter a name, so `\mathcal{L}(\theta)` is a call. `\mathbb` is not here: it names sets. */
const nameFonts = new Set(['mathcal', 'mathscr', 'mathfrak', 'mathbf', 'boldsymbol', 'bm'])
/** Calligraphic fonts. A distribution is often named with one, for example `\mathcal{N}` or `\mathcal{U}`. */
const calligraphicFonts = new Set(['mathcal', 'mathscr'])
/** Fonts that make a letter bold. A bold letter is a variable. */
const boldFonts = new Set(['bf', 'mathbf', 'textbf', 'boldsymbol', 'bm'])
const solarBases = new Set(['M', 'L', 'R'])
const solarMarks = new Set(['\\odot', '⊙'])
/**
 * Letters that name a probability density or a distribution, so `x \sim p_t` means x is drawn from it.
 * Without one of these on the right, `\sim` keeps its meaning of similarity, as in `\triangle ABC \sim \triangle DEF`.
 */
const densityLetters = new Set(['p', 'q', 'P', 'Q', '\\pi'])

/** The operators of probability, keyed by the letter or the name that writes them. */
const statistics: Readonly<Record<string, 'Expectation' | 'Probability' | 'Variance' | 'Covariance'>> = {
  E: 'Expectation',
  P: 'Probability',
  Pr: 'Probability',
  Var: 'Variance',
  Cov: 'Covariance',
}

/** Superscripts that mark a symbol instead of raising it to a power: `\mathbb{R}^{+}`, `x^{*}`. */
const superscriptMarks: Readonly<Record<string, string>> = { '+': '+', '-': '-', '*': '\\ast', '\\ast': '\\ast', '\\dagger': '\\dagger', '\\dag': '\\dagger', '†': '\\dagger', '\\top': 'T', '\\intercal': 'T', '\\vee': '\\vee', '\\wedge': '\\wedge' }

function relationOf(node: TexNode): string | undefined {
  if (node.type !== 'symbol')
    return undefined
  const key = canonicalSymbol(node.value)
  return relationHeads[key] === undefined ? undefined : key
}

function operatorOf(value: string): string | undefined {
  // `/` and `*` have their own spellings, but they read as `\div` and `\times`.
  const key = canonicalSymbol(value)
  return operatorHeads[key] === undefined ? undefined : key
}

function containsSymbol(nodes: readonly TexNode[] | undefined, values: ReadonlySet<string>): boolean {
  return nodes?.some((node) => {
    switch (node.type) {
      case 'symbol':
        return values.has(node.value)
      case 'group':
      case 'fence':
        return containsSymbol(node.children, values)
      case 'scripts':
        return containsSymbol([node.base], values) || containsSymbol(node.sub, values) || containsSymbol(node.sup, values)
      case 'command':
        return node.args.some(argument => containsSymbol(argument, values))
      default:
        return false
    }
  }) ?? false
}

function containsOperator(nodes: readonly TexNode[]): boolean {
  return nodes.some(node => (node.type === 'symbol' && operatorOf(node.value) !== undefined) || ((node.type === 'group' || node.type === 'fence') && containsOperator(node.children)))
}

function isOnlySymbol(nodes: readonly TexNode[] | undefined, value: string): boolean {
  return nodes?.length === 1 && nodes[0]!.type === 'symbol' && nodes[0]!.value === value
}

/** Splits `a, b` at its only comma. A list with more or fewer items is not a pair. */
function splitPair(nodes: readonly TexNode[]): [TexNode[], TexNode[]] | undefined {
  const commas = nodes.flatMap((node, index) => node.type === 'symbol' && node.value === ',' ? [index] : [])
  if (commas.length !== 1)
    return undefined
  const left = nodes.slice(0, commas[0])
  const right = nodes.slice(commas[0]! + 1)
  return left.length > 0 && right.length > 0 ? [left, right] : undefined
}

/** Splits a list at its top-level commas. Commas inside groups and delimiters stay. */
function splitClauses(nodes: readonly TexNode[]): TexNode[][] {
  const clauses: TexNode[][] = [[]]
  for (const node of nodes) {
    if (node.type === 'symbol' && node.value === ',')
      clauses.push([])
    else
      clauses.at(-1)!.push(node)
  }
  return clauses
}

/** A number keeps its digits. Other symbols keep their TeX token. */
function atom(value: string): MathJson {
  // `.5` omits the zero before the point. It reads as 0.5.
  if (/^\.\d+$/.test(value))
    return { num: `0${value}` }
  return number.test(value) ? { num: value } : value
}

/**
 * One operand or operator of a term list, before the operators are nested.
 * `prefix` marks a unary sign that applies to the next operand.
 */
type Item
  = | { kind: 'operand', value: MathJson }
    | { kind: 'operator', key: string }
    | { kind: 'prefix', key: string }

/** An item of {@link lowerTerms}: a term item, or a separator between the items of a list. */
type ListItem = Item | { kind: 'separator' }

/**
 * Lowers the syntax tree of a formula into MathJSON.
 *
 * This is the only place that decides what notation means, for example that `\frac{d}{dx}` is a derivative or that a
 * pair after `\in` is an interval. It keeps what the writer wrote and never simplifies.
 */
export function lowerMath(nodes: readonly TexNode[]): MathJson {
  return lowerList(nodes)
}

/** Lowers a list that may hold relations and comma-separated statements. */
function lowerList(nodes: readonly TexNode[]): MathJson {
  const clauses = splitClauses(nodes)
  if (clauses.filter(clause => clause.some(node => relationOf(node) !== undefined)).length >= 2)
    return ['Clauses', ...clauses.map(lowerClause)]
  return lowerClause(nodes)
}

/** Lowers one statement. Each relation joins the expression on its left with the operand on its right. */
function lowerClause(nodes: readonly TexNode[]): MathJson {
  const operands: TexNode[][] = [[]]
  const relations: string[] = []
  for (const node of nodes) {
    let relation = relationOf(node)
    // `:=` is two tokens in TeX. A colon right before `=` makes the definition, as `\coloneqq` does.
    const last = operands.at(-1)!.at(-1)
    if (relation === '=' && last?.type === 'symbol' && last.value === ':') {
      operands.at(-1)!.pop()
      relation = '\\coloneqq'
    }
    if (relation !== undefined) {
      relations.push(relation)
      operands.push([])
    }
    else {
      operands.at(-1)!.push(node)
    }
  }

  // `f: X \to Y` is a function signature: the arrow maps the set before it, not the name.
  const first = operands[0]!
  const colon = first.findIndex(node => node.type === 'symbol' && (node.value === ':' || node.value === '\\colon'))
  let start = 0
  let left: MathJson
  if (colon > 0 && relations[0] === '\\to') {
    left = ['Mapping', lowerTerms(first.slice(0, colon)), lowerTerms(first.slice(colon + 1)), lowerTerms(operands[1]!)]
    start = 1
  }
  else {
    left = lowerTerms(first)
  }

  for (let index = start; index < relations.length; index++) {
    const right = lowerTerms(operands[index + 1]!, relations[index])
    let head = relationHeads[relations[index]!]!
    if (relations[index] === '\\to' && isMapArrow(left, right))
      head = 'Arrow'
    // `x \sim p_t` draws x from a distribution. Between two figures, `\sim` keeps its meaning of similarity.
    else if (relations[index] === '\\sim' && isDistribution(right))
      head = 'Distributed'
    // In measurements `\sim` means about: `\sim 50` alone, or `z \sim 1` before a quantity.
    else if (relations[index] === '\\sim' && isQuantity(right))
      head = left === nothing ? 'About' : 'Approx'
    // `\approx 7` with nothing on its left reads "about seven", as a leading `\sim` does.
    else if (relations[index] === '\\approx' && left === nothing && isQuantity(right))
      head = 'About'
    left = head === 'About' ? ['About', right] : [head, left, right]
  }
  return left
}

/** Heads of objects that are sets, spaces, or other structures, not numbers, so nothing approaches them. */
const structureHeads = new Set(['Apply', 'NumberSet', 'Name', 'Set', 'Sequence', 'Bracket'])

/**
 * True when an expression names a structure: a capital letter, a number set, or one of these with scripts.
 * A call is a structure when its name is one, so `H_k(M)` is a group of homology but `f(x)` is a value.
 */
function isStructure(value: MathJson): boolean {
  if (typeof value === 'string')
    return upperLetter.test(value) || (greekCommands.has(value) && value[1] !== value[1]!.toLowerCase())
  const head = headOf(value)
  if (head === 'Subscript' || head === 'Superscript' || head === 'Apply')
    return isStructure(argsOf(value)[0] ?? nothing)
  if (head === 'Accent')
    return isStructure(argsOf(value)[1] ?? nothing)
  return head !== undefined && structureHeads.has(head)
}

/**
 * True when `left \to right` maps one structure to another, as in `H_k(M) \to H_k(M, N)` or `X \to Y`, so the arrow
 * reads "to". Otherwise it is a limit, as in `n \to \infty` or `f(x) \to L`, and reads "approaches".
 *
 * A call on the right is a structure: nothing approaches `H_k(M, N)`. A capital letter on the right is a structure
 * only when the left is one too, because `f(x) \to L` approaches the limit L.
 */
function isMapArrow(left: MathJson, right: MathJson): boolean {
  const head = headOf(right)
  if (head !== undefined && structureHeads.has(head))
    return true
  return isStructure(right) && isStructure(left)
}

/** Nests a flat list of operands and operators, with multiplicative operators first. Each level is left-associative. */
function nest(items: readonly Item[]): MathJson {
  // Apply unary signs to the operand after them.
  const resolved: Item[] = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!
    if (item.kind !== 'prefix') {
      resolved.push(item)
      continue
    }
    const next = items[index + 1]
    if (next?.kind === 'operand') {
      resolved.push({ kind: 'operand', value: [unaryHeads[item.key]!, next.value] })
      index++
    }
    else {
      resolved.push({ kind: 'operand', value: [unaryHeads[item.key]!] })
    }
  }

  // Adjacent operands multiply without a sign, as in `2ab`.
  const joined: Item[] = []
  for (const item of resolved) {
    const previous = joined.at(-1)
    if (item.kind === 'operand' && previous?.kind === 'operand') {
      const value = previous.value
      previous.value = isFunction(value, 'InvisibleOperator') ? ['InvisibleOperator', ...argsOf(value), item.value] : ['InvisibleOperator', value, item.value]
      continue
    }
    joined.push({ ...item })
  }

  function level(list: readonly Item[], heads: (head: string) => boolean): Item[] {
    const result: Item[] = []
    for (let index = 0; index < list.length; index++) {
      const item = list[index]!
      const left = result.at(-1)
      const right = list[index + 1]
      if (item.kind === 'operator' && heads(operatorHeads[item.key]!) && left?.kind === 'operand' && right?.kind === 'operand') {
        left.value = [operatorHeads[item.key]!, left.value, right.value]
        index++
        continue
      }
      result.push({ ...item })
    }
    return result
  }

  const result = level(level(joined, head => multiplicative.has(head)), () => true)
  // A dangling operator, as in `1 +`, keeps its place as a symbol.
  const values = result.map(item => item.kind === 'operand' ? item.value : item.key)
  return values.length === 1 ? values[0]! : values.length === 0 ? nothing : ['InvisibleOperator', ...values]
}

/**
 * Nests each part of a list of terms. One part is an ordinary expression. More parts make `["Sequence", ...]`.
 *
 * The split comes before the nesting, so an operator never joins two items of a list: in `a, -b` the minus is the
 * sign of `b`, not a subtraction from `a`. Empty parts, as in a trailing comma, are dropped.
 */
function nestList(items: readonly ListItem[]): MathJson {
  const parts: Item[][] = [[]]
  for (const item of items) {
    if (item.kind === 'separator')
      parts.push([])
    else
      parts.at(-1)!.push(item)
  }
  const filled = parts.filter(part => part.length > 0)
  return filled.length > 1 ? ['Sequence', ...filled.map(nest)] : nest(filled[0] ?? [])
}

/** True when a node is a calligraphic letter, with or without scripts, for example `\mathcal{N}` or `\mathcal{L}_{FM}`. */
function isCalligraphic(node: TexNode): boolean {
  if (node.type === 'scripts')
    return isCalligraphic(node.base)
  return node.type === 'command' && calligraphicFonts.has(node.name)
}

/**
 * Returns the operator of probability that a node writes, with its subscript, for example `\mathbb{E}_{x \sim p}`,
 * `\operatorname{Var}`, or `\Pr`. The subscript holds the variables or the distributions that the operator averages
 * over.
 */
function statisticOf(node: TexNode): { head: string, sub?: TexNode[] } | undefined {
  if (node.type === 'scripts' && !node.sup?.length) {
    const inner = statisticOf(node.base)
    return inner && { head: inner.head, sub: node.sub }
  }
  let name: string | undefined
  if (node.type === 'command' && (node.name === 'mathbb' || node.name === 'mathbf') && node.args[0]?.length === 1 && node.args[0][0]!.type === 'symbol')
    name = node.args[0][0]!.value
  else if (node.type === 'text' && (node.name === 'operatorname' || node.name === 'mathrm'))
    name = node.value.trim()
  else if (node.type === 'symbol' && node.value === '\\Pr')
    name = 'Pr'
  const head = name === undefined ? undefined : statistics[name]
  return head && { head }
}

/** Number sets of school that read as sets with powers, as `\mathbb{R}^n`. Other blackboard letters name spaces. */
const schoolNumberSets = new Set(['R', 'Z', 'Q', 'C', 'N'])

/** True when an expression is a blackboard letter that names a space, as `\mathbb{P}`, not a number set of school. */
function isSpaceName(value: MathJson): boolean {
  if (headOf(value) !== 'NumberSet')
    return false
  const letter = argsOf(value)[0]
  return typeof letter === 'string' && !schoolNumberSets.has(letter)
}

/** Letters that name function spaces, as `L^p(\Omega)` or `H^1(\Omega)`. */
const spaceLetters = new Set(['L', 'H', 'W', 'C', '\\ell'])

/**
 * The name of a called function space keeps its exponent as a label: `L^p(\Omega)` is L p of omega. A power of a
 * letter is not called, so `L^p` before parentheses is a space.
 */
function spaceCallee(callee: MathJson): MathJson {
  const [base = nothing, exponent = nothing] = argsOf(callee)
  // Upright text before a call names the function, as `\mathrm{GL}(n)`. It is not the unit gigaliter.
  if (headOf(callee) === 'Unit' && exponent === nothing)
    return ['Text', base]
  return headOf(callee) === 'Power' && typeof base === 'string' && spaceLetters.has(base) ? ['Superscript', base, exponent] : callee
}

/** True when an expression is a measured quantity: a number, possibly with a power, a percent, or a unit. */
function isQuantity(value: MathJson): boolean {
  if (isNumber(value))
    return true
  const head = headOf(value)
  if (head === 'Power' || head === 'Percent' || head === 'Negate')
    return isQuantity(argsOf(value)[0] ?? nothing)
  if (head === 'InvisibleOperator' || head === 'Multiply')
    return isQuantity(argsOf(value)[0] ?? nothing) && argsOf(value).slice(1).every(item => headOf(item) === 'Unit' || isQuantity(item))
  return false
}

/** True when the right side of `\sim` names a distribution or a density, see {@link densityLetters}. */
function isDistribution(value: MathJson): boolean {
  if (typeof value === 'string')
    return densityLetters.has(value)
  const head = headOf(value)
  const [first = nothing, second = nothing] = argsOf(value)
  if (head === 'Accent')
    return first === '\'mathcal\'' || first === '\'mathscr\''
  if (head === 'Subscript' || head === 'Superscript' || head === 'Apply')
    return isDistribution(first)
  // `\text{Bernoulli}(p)` and `\operatorname{Unif}`: a named function on the right of `\sim` is a distribution.
  return head === 'Text' && second === nothing
}

/** Operators that bind tighter than a sum, so a sum in parentheses after them keeps its brackets: `a - (b - c)`. */
const tightOperators = new Set(['-', '\\times', '\\cdot', '\\div'])

/**
 * True when parentheses with an operator inside must be read, because a neighbor binds to them.
 *
 * Silent brackets lose the grouping that they write. `v - (x - \epsilon)` read as "v minus x minus epsilon" means
 * `v - x - \epsilon`, and `(1-t)\epsilon` read as "one minus t epsilon" means `1 - t\epsilon`. So the brackets are read
 * when an operand comes right before them, as in `n(n+1)`, when an operand comes right after them, as in `(1-t)\epsilon`,
 * when a minus, a times, or a division sign comes before them, or when a times or a division sign comes after them, as
 * in `(x+1)/2`. After a plus or a relation, and before a plus, a minus, or a relation, they can stay silent.
 */
function isBound(afterOperand: boolean, previous: TexNode | undefined, next: TexNode | undefined): boolean {
  if (afterOperand)
    return true
  if (previous?.type === 'symbol' && tightOperators.has(operatorOf(previous.value) ?? previous.value))
    return true
  if (next === undefined)
    return false
  if (next.type !== 'symbol')
    return true
  const nextOperator = operatorOf(next.value)
  if (nextOperator !== undefined && nextOperator !== '-' && tightOperators.has(nextOperator))
    return true
  // A symbol after the brackets starts an operand unless it is an operator, a relation, a separator, or a postfix mark.
  return operatorOf(next.value) === undefined && relationOf(next) === undefined && !silent.has(next.value) && !['!', '\'', '\\prime', '%', '\\%'].includes(next.value)
}

/** True when the nodes are one centered dot, the mark of an empty argument slot. */
function isPlaceholder(nodes: readonly TexNode[]): boolean {
  return nodes.length === 1 && nodes[0]!.type === 'symbol' && placeholderMarks.has(nodes[0]!.value)
}

/**
 * True when a node can name a function: a letter, a Greek letter, or one of them with scripts or an accent, for
 * example `f`, `\phi`, `H_k`, `f^{-1}`, or `\bar{x}`.
 *
 * `before` is the node before `name`. A capital letter after another capital letter is the end of a name of geometry,
 * as `B` in `AB`, so it does not name a function.
 */
function isCallee(name: TexNode, before: TexNode | undefined): boolean {
  switch (name.type) {
    case 'symbol':
      if (functionCommands.has(name.value))
        return true
      if (constants.has(name.value) || (!latinLetter.test(name.value) && !greekCommands.has(name.value)))
        return false
      // False for the last capital of a name such as `AB`.
      return !upperLetter.test(name.value) || before?.type !== 'symbol' || !upperLetter.test(before.value)
    case 'scripts':
      // A power of a letter before parentheses multiplies, as `x^2(t+1)`. A function command keeps its call, as
      // `\sin^2(x)`.
      if (name.base.type === 'symbol' && functionCommands.has(name.base.value))
        return true
      if (!name.sub?.length && name.sup?.length && name.sup.every(item => item.type === 'symbol' && digits.test(item.value)))
        return false
      return isCallee(name.base, undefined)
    // `\operatorname{tr}(A)` and `\mathrm{GL}(n)` name a function in upright text.
    case 'text':
      return (name.name === 'operatorname' || name.name === 'mathrm') && /^[a-z]+$/i.test(name.value.trim())
    case 'command':
      // A blackboard letter that names a space can be called, as `\mathbb{L}^\infty(X)`. School number sets cannot.
      if (name.name === 'mathbb' && name.args[0]?.length === 1 && name.args[0][0]!.type === 'symbol' && !schoolNumberSets.has(name.args[0][0]!.value))
        return true
      // A font name can have a few letters, as `\mathcal{CN}` of the complex normal distribution.
      if (nameFonts.has(name.name) && name.args[0] && name.args[0].length <= 3 && name.args[0].every(item => item.type === 'symbol' && latinLetter.test(item.value)))
        return true
      return (accentCommands.has(name.name) || nameFonts.has(name.name)) && name.args[0]?.length === 1 && isCallee(name.args[0][0]!, undefined)
    default:
      return false
  }
}

/**
 * True when a name carries more than a letter: a subscript, a superscript that is not a number, or an accent. Such a
 * name is usually a function or an operator of its field, for example `H_k` of homology or `f^{-1}`. A number
 * superscript is a power, so `x^2(x+1)` stays a product.
 */
function isDecorated(name: TexNode): boolean {
  if (name.type === 'command')
    return true
  if (name.type !== 'scripts')
    return false
  const numberPower = name.sup !== undefined && name.sup.every(node => node.type === 'symbol' && digits.test(node.value))
  return Boolean(name.sub?.length) || (Boolean(name.sup?.length) && !numberPower)
}

/**
 * Returns the arguments of `name(...)` when the parentheses are a function call, or undefined when they group a
 * factor of a product.
 *
 * TeX writes `f(x)` and `n(n+1)` the same way: a letter, then parentheses. Speech must choose, because "f of x" and
 * "n times the quantity n plus one" are different formulas for the listener. The rules, in order:
 *
 * 1. Only parentheses after a name can be a call, see {@link isCallee}.
 * 2. A top-level comma means arguments, because a product has no comma: `H_k(M, M-N)`, `A_1(\Sigma, f)`. A pair with
 *    an infinite bound is an interval instead, as in `(-\infty, 0)`.
 * 3. One argument without an operator is a call: `x(t)`, `A_1(f)`, `p(\cdot)`. A writer multiplies letters as `xt`.
 * 4. An argument with an operator is a call only after a decorated name or a function letter: `H_1(S-P)` and
 *    `f(x+1)` are calls, but `n(n+1)` and `a(b+c)` are products.
 *
 * In Chinese, Japanese, and Korean a simple call reads as the product did, so these rules change only English words
 * and the grouped readings, see `MathLocale.apply`.
 */
function callArguments(name: TexNode, before: TexNode | undefined, fence: Extract<TexNode, { type: 'fence' }>): MathJson[] | undefined {
  // A calligraphic name before brackets is a distribution on an interval, as in `\mathcal{U}[0,1]`. The interval is
  // its one argument.
  if (fence.open === '[' && isCalligraphic(name))
    return [lowerFence({ ...fence, sub: undefined, sup: undefined }, true, false)]
  // A name of capitals with an argument list is a function, as `vMF(\mu, \kappa)`. A name of geometry has no commas.
  const namedList = name.type === 'symbol' && upperLetter.test(name.value) && splitClauses(fence.children).length > 1
  if (fence.open !== '(' || (!isCallee(name, before) && !namedList))
    return undefined
  const parts = splitClauses(fence.children)
  if (parts.length > 1 && containsSymbol(fence.children, infinities))
    return undefined
  const call = parts.length > 1
    || isPlaceholder(fence.children)
    || !containsOperator(fence.children)
    || isDecorated(name)
    || name.type === 'text'
    || (name.type === 'symbol' && (functionLetters.has(name.value) || functionCommands.has(name.value)))
    || (name.type === 'scripts' && name.base.type === 'symbol' && functionCommands.has(name.base.value))
  if (!call)
    return undefined
  if (fence.children.length === 0)
    return []
  return parts.map(part => isPlaceholder(part) ? ['Placeholder'] : lowerArgument(part))
}

/**
 * Lowers an argument of a call or of a statistic. A bar inside it is a condition, as `P(A \mid B)` or
 * `p(x \mid \theta)`: the first part given the second. Outside arguments and sets, `a \mid b` is divides.
 */
function lowerArgument(nodes: readonly TexNode[]): MathJson {
  const bar = nodes.findIndex(node => node.type === 'symbol' && (node.value === '\\mid' || node.value === '|'))
  if (bar <= 0 || bar === nodes.length - 1)
    return lowerList(nodes)
  return ['Given', lowerList(nodes.slice(0, bar)), lowerList(nodes.slice(bar + 1))]
}

/**
 * Lowers `\pmod{n}`. KaTeX writes it as parentheses around an upright mod and the modulus, which would read as a call.
 */
function modulusOf(node: TexNode): MathJson | undefined {
  if (node.type !== 'fence' || node.open !== '(')
    return undefined
  const [wrapped, ...rest] = node.children
  // KaTeX wraps the upright mod in a group.
  const first = wrapped?.type === 'group' && wrapped.children.length === 1 ? wrapped.children[0] : wrapped
  return first?.type === 'text' && first.value.trim() === 'mod' && rest.length > 0 ? ['Modulo', lowerList(rest)] : undefined
}

/** `relation` is the relation before the terms, so `\in` can mark the interval after it. */
function lowerTerms(nodes: readonly TexNode[], relation?: string): MathJson {
  const items: ListItem[] = []
  let afterOperand = false

  const push = (value: MathJson) => {
    items.push({ kind: 'operand', value })
    afterOperand = true
  }
  const replaceLast = (wrap: (value: MathJson) => MathJson) => {
    const last = items.at(-1)
    if (last?.kind === 'operand')
      last.value = wrap(last.value)
    else
      push(wrap(nothing))
  }

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    const next = nodes[index + 1]
    const previous = nodes[index - 1]

    // `\mathbb{E}` is an expectation only with an argument after it, or with a subscript and more terms after it.
    // Alone, as in `B(\mathbb{E})` or `(\Omega, \mathcal F, \mathbb P)`, it names a space or a measure.
    const statistic = statisticOf(node)
    const hasArgument = next?.type === 'fence' || (statistic?.sub !== undefined && next !== undefined)
    if (statistic && hasArgument) {
      const condition = statistic.sub ? [lowerList(statistic.sub)] : []
      // `\mathbb{E}[X]` and `\Pr(A)`: the brackets after the operator hold its argument. They are not read.
      if (next?.type === 'fence' && (next.open === '[' || next.open === '(' || next.open === '\\{')) {
        push(lowerScripts([statistic.head, lowerArgument(next.children), ...condition], next.sub, next.sup))
        index++
        continue
      }
      // `\mathbb{E}_{x} \|f(x)\|^2` has no brackets, so the operator takes the rest of the operand, as a sum does.
      push([statistic.head, lowerTerms(nodes.slice(index + 1)), ...condition])
      break
    }

    const big = bigOperator(node)
    if (big) {
      // A big operator takes the rest of the operand, up to the next relation.
      push(lowerBigOperator(big, lowerTerms(nodes.slice(index + 1))))
      break
    }

    const derivative = derivativeOf(node)
    if (derivative) {
      // `\frac{d}{dx}` alone is an operator, so it takes the rest of the operand, as a big operator does.
      if (derivative.body !== undefined) {
        push(derivative.order ? ['D', derivative.body, derivative.variable, { num: derivative.order }] : ['D', derivative.body, derivative.variable])
        continue
      }
      const body = lowerTerms(nodes.slice(index + 1))
      push(derivative.order ? ['D', body, derivative.variable, { num: derivative.order }] : ['D', body, derivative.variable])
      break
    }

    const prefixed = next === undefined ? undefined : lowerSetPrefix(node, next)
    if (prefixed !== undefined) {
      push(prefixed)
      index++
      continue
    }

    const modulus = modulusOf(node)
    if (modulus !== undefined) {
      push(modulus)
      continue
    }

    if (node.type === 'fence') {
      // `f(x)` wraps the name that was pushed last into a call, with the scripts of the parentheses, as in `f(x)^2`.
      const args = afterOperand && previous !== undefined ? callArguments(previous, nodes[index - 2], node) : undefined
      if (args !== undefined) {
        replaceLast(callee => lowerScripts(['Apply', spaceCallee(callee), ...args], node.sub, node.sup))
        continue
      }
      const afterSetSymbol = index === 0
        ? relation !== undefined && setRelations.has(relation)
        : previous?.type === 'symbol' && setOperators.has(canonicalSymbol(previous.value))
      push(lowerFence(node, afterSetSymbol, isBound(afterOperand, previous, next)))
      continue
    }

    // `25^\circ\mathrm{C}` is a temperature, not 25 degrees followed by the letter C.
    if (node.type === 'text' && node.value.trim() === 'C' && previous?.type === 'scripts' && previous.sup?.length === 1 && previous.sup[0]!.type === 'symbol' && degreeMarks.has(previous.sup[0]!.value)) {
      replaceLast(() => ['Celsius', lowerNode(previous.base)])
      continue
    }

    // `AB` of geometry is one name, not a product of points.
    if (node.type === 'symbol' && upperLetter.test(node.value)) {
      let end = index
      while (nodes[end + 1]?.type === 'symbol' && upperLetter.test((nodes[end + 1] as { value: string }).value))
        end++
      if (end > index) {
        push(['Name', ...nodes.slice(index, end + 1).map(item => (item as { value: string }).value)])
        index = end
        continue
      }
    }

    if (node.type !== 'symbol') {
      push(lowerNode(node))
      continue
    }

    const value = node.value
    if (silent.has(value)) {
      if (separators.has(value))
        afterOperand = false
      if (listSeparators.has(value))
        items.push({ kind: 'separator' })
      continue
    }

    // `\mathrm{Rt}\triangle ABC` is a right triangle. The triangle after Rt is the shape, not symmetric difference.
    const rightTriangle = previous?.type === 'text' && previous.value.trim() === 'Rt'
    if (afterOperand && triangles.has(value) && !rightTriangle) {
      items.push({ kind: 'operator', key: '\\triangle' })
      afterOperand = false
      continue
    }

    const operator = operatorOf(value)
    if (operator !== undefined && !triangles.has(value)) {
      items.push(afterOperand || unaryHeads[operator] === undefined ? { kind: 'operator', key: operator } : { kind: 'prefix', key: operator })
      afterOperand = false
      continue
    }

    if (value === '!') {
      replaceLast(operand => ['Factorial', operand])
      continue
    }

    if ((value === '%' || value === '\\%') && previous?.type === 'symbol' && number.test(previous.value)) {
      replaceLast(operand => ['Percent', operand])
      continue
    }

    if (value === '\'' || value === '\\prime') {
      replaceLast(operand => ['Prime', operand])
      continue
    }

    // `10\,\Omega` is a resistance: the capital omega after a number is the ohm.
    if ((value === '\\Omega' || value === 'Ω') && afterOperand && isNumber(items.at(-1)?.kind === 'operand' ? (items.at(-1) as { value: MathJson }).value : undefined)) {
      push(['Unit', text('Ω')])
      continue
    }

    push(atom(value))
  }

  return nestList(items)
}

/** Lowers a prefix that takes the operand after it, for example `\complement_U A`, `\mathcal{P}(A)`, or `\#A`. */
function lowerSetPrefix(node: TexNode, next: TexNode): MathJson | undefined {
  if (node.type === 'symbol' && complements.has(node.value))
    return ['Complement', lowerNode(next)]
  if (node.type === 'scripts' && node.base.type === 'symbol' && complements.has(node.base.value) && !node.sup?.length)
    return node.sub ? ['Complement', lowerNode(next), lowerList(node.sub)] : ['Complement', lowerNode(next)]
  if (node.type === 'symbol' && node.value === '#')
    return ['Cardinality', lowerNode(next)]

  if (next.type !== 'fence' || next.open !== '(')
    return undefined
  if (node.type === 'command' && node.name === 'mathcal' && isOnlySymbol(node.args[0], 'P'))
    return ['PowerSet', lowerList(next.children)]
  if (node.type === 'text' && node.value.trim() === 'card')
    return ['Cardinality', lowerList(next.children)]
  return undefined
}

interface BigOperator { head: BigHead, sub?: TexNode[], sup?: TexNode[] }

function bigOperator(node: TexNode): BigOperator | undefined {
  if (node.type === 'symbol' && bigOperators[node.value])
    return { head: bigOperators[node.value]! }
  if (node.type === 'scripts' && node.base.type === 'symbol' && bigOperators[node.base.value])
    return { head: bigOperators[node.base.value]!, sub: node.sub, sup: node.sup }
  // A small `\cap` or `\cup` with bounds is written for the big one, as in `\cap_{i=1}^r E_i`.
  if (node.type === 'scripts' && node.base.type === 'symbol' && (node.sub?.length || node.sup?.length) && smallSetOperators[node.base.value])
    return { head: smallSetOperators[node.base.value]!, sub: node.sub, sup: node.sup }
  return undefined
}

/**
 * Lowers a big operator with the body that it takes.
 *
 * - `["Limit", body, ["Bounds", variable, target, side]]`, where side is `1` from the right and `-1` from the left.
 * - `["Sum" | "Product" | "Integrate", body, ["Bounds", variable, from, to]]`.
 * - Any of them with `["Condition", condition, to]` when the subscript is not `variable = from`.
 *
 * `Nothing` fills a bound that the writer left out.
 */
function lowerBigOperator({ head, sub, sup }: BigOperator, body: MathJson): MathJson {
  if (head === 'Limit') {
    const arrow = sub?.findIndex(node => node.type === 'symbol' && arrows.has(node.value)) ?? -1
    if (sub && arrow > 0) {
      // `x \to 0^{+}` approaches from the right. The sign is a side, not a power.
      const target = sub.slice(arrow + 1)
      const only = target.length === 1 ? target[0]! : undefined
      const sign = only?.type === 'scripts' && !only.sub?.length && only.sup?.length === 1 && only.sup[0]!.type === 'symbol' ? only.sup[0]!.value : undefined
      if (only?.type === 'scripts' && (sign === '+' || sign === '-'))
        return ['Limit', body, ['Bounds', lowerList(sub.slice(0, arrow)), lowerNode(only.base), { num: sign === '+' ? '1' : '-1' }]]
      return ['Limit', body, ['Bounds', lowerList(sub.slice(0, arrow)), lowerList(target)]]
    }
    return sub ? ['Limit', body, ['Condition', lowerList(sub)]] : ['Limit', body]
  }

  const to = sup ? lowerList(sup) : nothing
  if (head === 'Integrate')
    return sub || sup ? ['Integrate', body, ['Bounds', nothing, sub ? lowerList(sub) : nothing, to]] : ['Integrate', body]

  const equals = sub?.findIndex(node => node.type === 'symbol' && node.value === '=') ?? -1
  if (sub && equals > 0)
    return [head, body, ['Bounds', lowerList(sub.slice(0, equals)), lowerList(sub.slice(equals + 1)), to]]
  if (sub)
    return [head, body, ['Condition', lowerList(sub), to]]
  return sup ? [head, body, ['Condition', nothing, to]] : [head, body]
}

/**
 * Returns the variable and the body of `\frac{d}{dx}`, `\frac{dy}{dx}`, or `\frac{\partial f}{\partial x}`.
 * `body` is undefined when the numerator holds only the mark, so the derivative applies to what follows.
 */
function derivativeOf(node: TexNode): { variable: MathJson, body?: MathJson, order?: string } | undefined {
  if (node.type !== 'command' || !fractionCommands.has(node.name))
    return undefined
  const [numerator = [], denominator = []] = node.args
  const isMark = (item: TexNode | undefined) => (item?.type === 'symbol' && derivativeMarks.has(item.value)) || (item?.type === 'text' && item.value.trim() === 'd')
  // `d^2` in the numerator of `\frac{d^2 y}{dx^2}` gives the order. The power of the variable repeats it.
  const first = numerator[0]
  const order = first?.type === 'scripts' && isMark(first.base) && !first.sub?.length && first.sup?.length === 1 && first.sup[0]!.type === 'symbol' && digits.test(first.sup[0]!.value) ? first.sup[0]!.value : undefined
  if ((!isMark(first) && order === undefined) || !isMark(denominator[0]) || denominator.length < 2)
    return undefined
  const last = denominator.at(-1)!
  const variable = order !== undefined && last.type === 'scripts' && !last.sub?.length ? [...denominator.slice(1, -1), last.base] : denominator.slice(1)
  return { variable: lowerList(variable), body: numerator.length > 1 ? lowerList(numerator.slice(1)) : undefined, order }
}

/**
 * Lowers a delimited group.
 *
 * - A bracket or an infinite bound makes an interval. `(a, b)` alone is also a point or the arguments of a function,
 *   so it needs a set symbol before it.
 * - `|x|` is `Abs`, and `\{...\}` is a set, with a condition after `\mid`.
 * - Other parentheses are `Delimiter`, which is silent, or `Group`, which is read as a quantity. A group is read when a
 *   power applies to it, or when it holds an operator and `bound` is true: an operand or a tight operator touches it,
 *   see {@link isBound}. Its brackets then decide the meaning, so they cannot go silent.
 */
function lowerFence(node: Extract<TexNode, { type: 'fence' }>, afterSetSymbol: boolean, bound: boolean): MathJson {
  let base: MathJson
  const pair = (node.open === '(' || node.open === '[') ? splitPair(node.children) : undefined
  const bracketed = node.open === '[' || node.close === ']'
  if (pair && (bracketed || afterSetSymbol || containsSymbol(node.children, infinities))) {
    const from = lowerList(pair[0])
    const to = lowerList(pair[1])
    base = ['Interval', node.open === '[' ? from : ['Open', from], node.close === ']' ? to : ['Open', to]]
  }
  else if (node.open === '\\lceil' || node.open === '⌈' || node.open === '\\lfloor' || node.open === '⌊') {
    base = [node.open === '\\lceil' || node.open === '⌈' ? 'Ceil' : 'Floor', lowerList(node.children)]
  }
  else if (normDelimiters.has(node.open)) {
    // `\|x\|_2` is the 2-norm. The subscript names the norm, so it stays inside `Norm` and only the power applies outside.
    // `\|\cdot\|` names the norm itself. Its dot is an empty slot, not a product.
    const inner: MathJson = isPlaceholder(node.children) ? ['Placeholder'] : lowerList(node.children)
    return lowerScripts(node.sub?.length ? ['Norm', inner, lowerList(node.sub)] : ['Norm', inner], undefined, node.sup)
  }
  else if (node.open === '|' || node.open === '\\vert' || node.open === '\\lvert') {
    base = ['Abs', lowerList(node.children)]
  }
  else if (node.open === '\\{' || node.open === '\\lbrace') {
    const condition = node.children.findIndex(child => child.type === 'symbol' && (child.value === '\\mid' || child.value === '|' || child.value === ':'))
    base = condition > 0
      ? ['Set', lowerList(node.children.slice(0, condition)), ['Condition', lowerList(node.children.slice(condition + 1))]]
      : ['Set', lowerList(node.children)]
  }
  else {
    const inner = lowerList(node.children)
    const product = bound && node.open === '(' && containsOperator(node.children)
    // Square brackets around one item mean something, for example the class `[M]` or a concentration, so they are read.
    if (node.open === '[')
      base = ['Bracket', inner]
    // `(V, E)` is a pair and `(a, b, c)` a tuple. Silent brackets would read them as a list of loose items.
    else if (node.open === '(' && headOf(inner) === 'Sequence')
      base = ['Tuple', ...argsOf(inner)]
    else
      base = node.sup?.length || product ? ['Group', inner] : ['Delimiter', inner]
  }
  return lowerScripts(base, node.sub, node.sup)
}

/** Lowers the scripts of a base. `baseNode` is the TeX base, so `A^c` checks the letter, not a lowered expression. */
function lowerScripts(base: MathJson, sub?: TexNode[], sup?: TexNode[], baseNode?: TexNode): MathJson {
  let result = base
  // A word in a subscript is a label, as `t` in `I_{\mathrm t}` or `max` in `x_{\text{max}}`, never a unit.
  const label = sub?.length === 1 && sub[0]!.type === 'text' ? sub[0]!.value.replace(/[{}\\]/g, '').trim() : undefined
  // `45.1_{\pm 0.5}` writes the uncertainty of a measurement: plus or minus 0.5.
  const uncertainty = isNumber(result) && sub?.[0]?.type === 'symbol' && (sub[0].value === '\\pm' || sub[0].value === '±') && sub.length > 1
  if (uncertainty)
    result = ['PlusMinus', result, lowerList(sub!.slice(1))]
  else if (label !== undefined)
    result = ['Subscript', result, ['Text', text(label)]]
  else if (sub?.length)
    result = ['Subscript', result, lowerList(sub)]
  if (sup?.length) {
    // `\mathrm{T}` and `\mathsf{T}` write the transpose mark in upright text.
    const uprightMark = sup.length === 1 && sup[0]!.type === 'text' && sup[0]!.name !== 'text' ? sup[0]!.value.replace(/[{}\\]/g, '').trim() : undefined
    const only = sup.length === 1 && sup[0]!.type === 'symbol' ? sup[0]!.value : uprightMark === 'T' ? 'T' : undefined
    const primes = sup.every(node => node.type === 'symbol' && (node.value === '\\prime' || node.value === '\''))
    // `f^{-1}` of a function is its inverse, not 1/f. Other bases keep the power, as `x^{-1}`.
    const inverse = sup.length === 2 && sup[0]!.type === 'symbol' && sup[0]!.value === '-' && sup[1]!.type === 'symbol' && sup[1]!.value === '1'
      && baseNode?.type === 'symbol' && (functionLetters.has(baseNode.value) || functionCommands.has(baseNode.value))
    // `n^{\text{th}}` writes an ordinal, not a power of the word th.
    const ordinal = sup.length === 1 && sup[0]!.type === 'text' && /^(?:th|st|nd|rd)$/.test(sup[0]!.value.trim())
    if (inverse)
      result = ['Inverse', result]
    else if (ordinal)
      result = ['Ordinal', result]
    // `f''` is the second derivative: a prime for each mark, never a power.
    else if (primes && sup.length > 1)
      result = sup.reduce<MathJson>(value => ['Prime', value], result)
    else if (only !== undefined && degreeMarks.has(only))
      result = ['Degrees', result]
    else if (only === '\\prime' || only === '\'')
      result = ['Prime', result]
    else if (only !== undefined && (complements.has(only) || (only === 'c' && baseNode?.type === 'symbol' && upperLetter.test(baseNode.value))))
      result = ['Complement', result]
    // `\mathbb{N}^{+}` and `\mathbb{N}^*` name the positive integers. The packs name the whole set, not the mark.
    else if (only !== undefined && headOf(result) === 'NumberSet' && signedSets[only] !== undefined && typeof argsOf(result)[0] === 'string')
      result = ['NumberSet', `${argsOf(result)[0] as string}${signedSets[only]}`]
    else if (only !== undefined && superscriptMarks[only] !== undefined)
      result = ['Superscript', result, superscriptMarks[only]!]
    // Some superscripts are labels, not powers:
    // - `x^1` is never written as a power, so its 1 is an index, as in `D^1_{\mu}`. A number base keeps the power: TeX
    //   reads `2^10` as `2^1` and 0.
    // - `A^T` is a transpose, and a capital T after a letter is a label more often than a power.
    // - A space named by a blackboard letter, as `\mathbb{P}^n` or `\mathbb{L}^\infty`, takes its dimension or its
    //   exponent as a name. The number sets of school, such as `\mathbb{R}^n`, keep the power reading.
    // - A superscript before its symbol, as `^2\Pi_{3/2}` of spectroscopy, has no base to raise.
    else if ((only === '1' && baseNode?.type !== 'symbol') || (only === '1' && baseNode?.type === 'symbol' && !number.test(baseNode.value)) || (only === 'T' && baseNode?.type !== 'symbol') || (only === 'T' && baseNode?.type === 'symbol' && latinLetter.test(baseNode.value)) || isSpaceName(base) || (result === nothing && only !== undefined && number.test(only)))
      result = ['Superscript', result, uprightMark === 'T' ? 'T' : lowerList(sup)]
    // `f^{(n)}` names an order or a label in parentheses. It is not a power of n.
    else if (sup.length === 1 && sup[0]!.type === 'fence' && sup[0]!.open === '(' && !sup[0]!.sub?.length && !sup[0]!.sup?.length)
      result = ['Superscript', result, ['Delimiter', lowerList(sup[0]!.children)]]
    else
      result = ['Power', result, lowerList(sup)]
  }
  return result
}

/** Splits a row of an array at its `&` cells. KaTeX wraps each cell in a group, which is unwrapped. */
function cellsOf(row: readonly TexNode[]): TexNode[][] {
  const cells: TexNode[][] = [[]]
  for (const node of row) {
    if (node.type === 'symbol' && node.value === '&')
      cells.push([])
    // `aligned` puts an empty group before the relation of a cell, as in `&= b`. It has no sound.
    else if (node.type === 'group')
      cells.at(-1)!.push(...node.children.filter(child => child.type !== 'group' || child.children.length > 0))
    else
      cells.at(-1)!.push(node)
  }
  return cells
}

/** Words that start the condition of a case, as `\text{if } x > 0`. The packs say their own word. */
const caseWords = /^\s*(?:if|for|when|,)\s*$/i
/** Words that write the last case, as `\text{otherwise}`. */
const otherwiseWords = /^\s*(?:otherwise|else|其他|其它|それ以外|그 ?외)\s*$/i

/**
 * Lowers an array.
 *
 * - `cases` becomes `["Cases", ["Case", value, condition?], ...]`. A case without a condition, or with "otherwise",
 *   is the last case.
 * - A matrix or a determinant becomes `["Matrix", ["Row", ...cells], ...]` or `Determinant`, so each cell is heard.
 * - `aligned` and other arrays are `Rows` of statements. Their `&` only aligns the columns.
 */
function lowerRows(node: Extract<TexNode, { type: 'rows' }>): MathJson {
  if (node.name === 'cases') {
    return ['Cases', ...node.rows.filter(row => row.length > 0).map((row): MathJson => {
      const [value = [], ...rest] = cellsOf(row)
      const condition = rest.flat()
      while (condition[0]?.type === 'text' && caseWords.test(condition[0].value))
        condition.shift()
      const otherwise = condition.length === 0 || (condition.length === 1 && condition[0]!.type === 'text' && otherwiseWords.test(condition[0].value))
      return otherwise ? ['Case', lowerList(value)] : ['Case', lowerList(value), lowerList(condition)]
    })]
  }
  if (node.name === 'matrix' || node.name === 'determinant')
    return [node.name === 'matrix' ? 'Matrix' : 'Determinant', ...node.rows.filter(row => row.length > 0).map((row): MathJson => ['Row', ...cellsOf(row).map(lowerList)])]
  // A row that starts with a relation continues the row before it, as `&= c` in a derivation, so they read as one chain.
  const statements: TexNode[][] = []
  for (const row of node.rows) {
    const tokens = cellsOf(row).flat()
    if (tokens.length === 0)
      continue
    if (statements.length > 0 && relationOf(tokens[0]!) !== undefined)
      statements.at(-1)!.push(...tokens)
    else
      statements.push(tokens)
  }
  return statements.length === 1 ? lowerList(statements[0]!) : ['Rows', ...statements.map(lowerList)]
}

/** Lowers a unit in text, for example `m`, `km2`, `m/s`, or `m/s^2`. Other text stays text. */
function lowerText(name: string, value: string): MathJson {
  // Unit commands become their symbols before the braces and backslashes go, so `\mu m` stays micrometers.
  const content = value.replace(/\\mu\s*/g, 'µ').replace(/\\Omega\s*/g, 'Ω').replace(/\\cdot|·/g, ' ').replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim()
  if (name === 'text' || name === 'operatorname')
    return ['Text', text(value.trim())]
  if (uprightLetters.has(content))
    return content
  // A bold letter is a vector or a matrix, as `{\bf B}`, never the unit byte.
  if (boldFonts.has(name) && /^[a-z]$/i.test(content))
    return content
  const ratio = /^([a-z]+\d?)\/([a-z]+)(?:\^(\d))?$/i.exec(content)
  if (ratio)
    return ratio[3] ? ['Unit', text(ratio[1]!), text(ratio[2]!), { num: ratio[3] }] : ['Unit', text(ratio[1]!), text(ratio[2]!)]
  return lowerUnitFactors(content) ?? ['Unit', text(content.replace(/\^?(\d)$/, '$1'))]
}

/**
 * Lowers a unit written as factors with powers, as `kg m^2`, `mol L^-1`, or `J mol^-1 K^-1`. Factors with a negative
 * power go after "per". Returns undefined for one factor with a positive power, which ./units reads alone.
 */
function lowerUnitFactors(content: string): MathJson | undefined {
  const factors = content.split(' ').map(factor => /^([^\d^-]+)\^?(-?\d)?$/.exec(factor))
  if (factors.includes(null))
    return undefined
  const parsed = factors as RegExpExecArray[]
  const up = parsed.filter(factor => !factor[2]?.startsWith('-'))
  const down = parsed.filter(factor => factor[2]?.startsWith('-'))
  if (parsed.length === 1 && down.length === 0)
    return undefined
  const numerator = text(up.map(factor => factor[1]! + (factor[2] ?? '')).join(' '))
  if (down.length === 0)
    return ['Unit', numerator]
  // One power after "per" reads as squared or cubed. Several factors after "per" each have the power one.
  if (down.length === 1 && down[0]![2] !== '-1')
    return ['Unit', numerator, text(down[0]![1]!), { num: down[0]![2]!.slice(1) }]
  if (down.some(factor => factor[2] !== '-1'))
    return undefined
  return ['Unit', numerator, text(down.map(factor => factor[1]!).join(' '))]
}

function lowerNode(node: TexNode): MathJson {
  switch (node.type) {
    case 'symbol':
      return silent.has(node.value) ? nothing : atom(node.value)
    case 'group':
      return lowerList(node.children)
    case 'text':
      return lowerText(node.name, node.value)
    // An extension reads the source of its command and replaces this node, see ./speech.
    case 'raw':
      return [rawHead, text(node.command), text(node.value)]
    case 'rows':
      return lowerRows(node)
    case 'scripts': {
      // `M_\odot` is the solar mass of astronomy, also `L_\odot` and `R_\odot`. The packs name them as words.
      if (node.base.type === 'symbol' && solarBases.has(node.base.value) && node.sub?.length === 1 && node.sub[0]!.type === 'symbol' && solarMarks.has(node.sub[0]!.value) && !node.sup?.length)
        return `${node.base.value}_\\odot`
      const base = node.base.type === 'symbol' && node.base.value === '' ? nothing : lowerNode(node.base)
      return lowerScripts(base, node.sub, node.sup, node.base)
    }
    case 'fence':
      return lowerFence(node, false, false)
    case 'command':
      return lowerCommand(node)
  }
}

function lowerCommand(node: Extract<TexNode, { type: 'command' }>): MathJson {
  const [first = [], second = []] = node.args
  if (fractionCommands.has(node.name))
    return ['Divide', lowerList(first), lowerList(second)]
  if (binomialCommands.has(node.name))
    return ['Binomial', lowerList(first), lowerList(second)]
  switch (node.name) {
    case 'sqrt':
      return node.option?.length ? ['Root', lowerList(first), lowerList(node.option)] : ['Sqrt', lowerList(first)]
    case 'overset':
    case 'stackrel':
      // `\overset{\frown}{AB}` is the arc AB. Other marks over a symbol are not read.
      return isOnlySymbol(first, '\\frown') ? ['Arc', lowerList(second)] : lowerList(second)
    case 'underset':
      return lowerList(second)
    case 'mathbb':
      return ['NumberSet', lowerList(first)]
    case 'overline':
      // A line over capital letters is a segment of geometry. Over other symbols it is a bar, as in a mean.
      return first.length >= 2 && first.every(item => item.type === 'symbol' && upperLetter.test(item.value))
        ? ['Segment', ...first.map(item => (item as { value: string }).value)]
        : ['Accent', text('overline'), lowerList(first)]
    default:
      return ['Accent', text(node.name), lowerList(first)]
  }
}
