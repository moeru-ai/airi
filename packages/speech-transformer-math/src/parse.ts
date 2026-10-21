import type { TexNode } from './tex'

import katex from 'katex'

import { fence } from './tex'

/**
 * The fields of a KaTeX parse node that the speech pipeline reads.
 *
 * KaTeX does not export the types of its parse tree, so this interface lists only the fields in use. `body` is a node,
 * a list, or the rows of an array, depending on `type`.
 */
interface KatexNode {
  type: string
  text?: string
  name?: string
  font?: string
  label?: string
  mclass?: string
  left?: string
  right?: string
  hasBarLine?: boolean
  body?: KatexNode | KatexNode[] | KatexNode[][]
  base?: KatexNode | null
  sup?: KatexNode | null
  sub?: KatexNode | null
  numer?: KatexNode
  denom?: KatexNode
  index?: KatexNode | null
  below?: KatexNode | null
  /** `align` for the arrays of `aligned` and `align`, whose rows are statements. */
  colSeparationType?: string
  /** Where the node starts and ends in the source that KaTeX parsed. */
  loc?: { start: number, end: number } | null
  mathml?: KatexNode[]
}

type KatexParse = (source: string, settings: { throwOnError: boolean, strict: boolean }) => KatexNode[]

// NOTICE:
// `katex.__parse` returns the parse tree, but KaTeX marks it as an internal API and its types omit it.
// The stage apps render with the same KaTeX: pnpm-workspace.yaml overrides the katex of rehype-katex to the catalog
// version, so speech reads the formula that the user sees.
// Source: node_modules/katex/katex.js (`__parse`), KaTeX 0.19.0. The catalog pins the exact version.
// Remove when KaTeX exports a typed parse function.
const katexParse = Reflect.get(katex, '__parse') as KatexParse

/**
 * Marks a placeholder of a raw command inside `\text{}`, see {@link liftRaw}. KaTeX rejects private-use characters in
 * text, so the marker is an ASCII word that a reply does not write.
 */
const rawMarker = 'airiraw'

/** A command that an extension reads from its source, as `\ce{H2O}` of chemistry. */
interface RawCommand {
  command: string
  value: string
}

/** `\not` before a relation: KaTeX writes it as a combining long solidus in the MathML branch. */
const notMark = '\u0338'
const negations: Readonly<Record<string, string>> = { '=': '\\neq', '\\in': '\\notin', '\\subseteq': '\\nsubseteq', '\\supseteq': '\\nsupseteq', '\\subset': '\\nsubseteq', '\\supset': '\\nsupseteq', '\\exists': '\\nexists' }

/** Fonts that show plain text, so their content is read as written, for example a unit in `\mathrm{m/s}`. */
const textFonts = new Set(['mathrm', 'textrm', 'mathit', 'textit', 'mathbf', 'textbf', 'mathsf', 'mathtt', 'rm', 'it', 'bf'])
/** Fonts that the reader handles as a command, for example `\mathbb{R}`. */
const commandFonts = new Set(['mathbb', 'mathcal', 'mathfrak', 'boldsymbol', 'bm', 'pmb'])
/** Nodes that change only spacing, size, or color. Their content, if any, is read. */
const transparent = new Set(['styling', 'sizing', 'color', 'smash', 'lap', 'internal'])
/** Nodes that have no sound. */
const silent = new Set(['kern', 'spacing', 'vphantom', 'phantom', 'hphantom', 'raw', 'cr', 'tag', 'middle'])

const digit = /^\d$/
/** KaTeX keeps the escape of these characters, but the reader matches the character, as in `\#A`. */
const escapedSpecials: Readonly<Record<string, string>> = { '\\#': '#', '\\$': '$', '\\&': '&', '\\_': '_' }

/**
 * Closes open braces and drops closing braces without a group, so KaTeX can parse a formula that a reply cut short.
 *
 * @example
 * balanceBraces('\\frac{1}{')
 * // => '\\frac{1}{}'
 */
function balanceBraces(source: string): string {
  let depth = 0
  let result = ''
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    if (char === '\\') {
      result += source.slice(index, index + 2)
      index++
      continue
    }
    if (char === '}' && depth === 0)
      continue
    if (char === '{')
      depth++
    if (char === '}')
      depth--
    result += char
  }
  return result + '}'.repeat(depth)
}

/**
 * Replaces each raw command, as `\ce{...}`, with a text placeholder. KaTeX does not know the commands of an extension,
 * and the extension reads their source itself, so KaTeX must not parse it.
 */
function liftRaw(source: string, commands: readonly string[]): { source: string, raw: RawCommand[] } {
  const raw: RawCommand[] = []
  if (commands.length === 0)
    return { source, raw }
  const pattern = new RegExp(`\\\\(${commands.map(command => command.replace(/\W/g, '')).join('|')})\\s*\\{`, 'g')
  let result = ''
  let last = 0
  for (const match of source.matchAll(pattern)) {
    if (match.index < last)
      continue
    const open = match.index + match[0].length
    let depth = 1
    let end = open
    for (; end < source.length && depth > 0; end++) {
      if (source[end] === '\\') {
        end++
        continue
      }
      if (source[end] === '{')
        depth++
      if (source[end] === '}')
        depth--
    }
    raw.push({ command: match[1]!, value: source.slice(open, depth === 0 ? end - 1 : end) })
    result += `${source.slice(last, match.index)}\\text{${rawMarker}${raw.length - 1}}`
    last = end
  }
  return { source: result + source.slice(last), raw }
}

function asList(body: KatexNode['body']): KatexNode[] {
  if (body === undefined)
    return []
  if (!Array.isArray(body))
    return [body]
  return body.flat()
}

/** Writes the content of a text node back as source text, for example `m/s^2` from `\mathrm{m/s^2}`. */
function plainText(nodes: readonly KatexNode[]): string {
  return nodes.map((node) => {
    if (node.type === 'supsub')
      return plainText(node.base ? [node.base] : []) + (node.sub ? `_${plainText([node.sub])}` : '') + (node.sup ? `^${plainText([node.sup])}` : '')
    if (node.type === 'spacing' || node.type === 'kern')
      return ' '
    if (node.text !== undefined)
      return node.text
    return plainText(asList(node.body))
  }).join('')
}

/**
 * Converts the KaTeX parse tree into the syntax tree of the reader.
 *
 * It joins what KaTeX splits for display: digits and a decimal point become one number, also when the last digit
 * carries a script, as in `10^{8}`. It reads negations from the MathML branch, lifts `\ce{}` content, and drops nodes
 * without sound. Delimiters are paired afterwards by {@link fence}.
 */
/**
 * The kind of an array by its delimiters: `cases` in a left brace, a matrix in parentheses or brackets, and a
 * determinant in bars.
 */
const arrayKinds: Readonly<Record<string, 'cases' | 'matrix' | 'determinant'>> = {
  '\\{.': 'cases',
  '\\lbrace.': 'cases',
  '()': 'matrix',
  '[]': 'matrix',
  '\\lbrack\\rbrack': 'matrix',
  '||': 'determinant',
  '\\vert\\vert': 'determinant',
}

/**
 * The rows of an array, with `&` between the cells. `aligned` and `align` hold statements, and other arrays hold
 * cells. The kind of an array in delimiters is set by the caller.
 */
function rowsOf(node: KatexNode, context: NormalizeContext): Extract<TexNode, { type: 'rows' }> {
  return {
    type: 'rows',
    name: node.colSeparationType === 'align' || node.colSeparationType === 'alignat' ? 'aligned' : 'array',
    rows: (node.body as KatexNode[][] | undefined ?? []).map(row => row.flatMap((cell, column) => [
      ...(column > 0 ? [{ type: 'symbol', value: '&' } as TexNode] : []),
      ...normalize([cell], context),
    ])),
  }
}

/** What {@link normalize} reads besides the nodes: the lifted raw commands, and the source that KaTeX parsed. */
interface NormalizeContext {
  raw: readonly RawCommand[]
  source: string
}

/** Spacing that groups the digits of one number, as `1\,000`. Wider spacing, as `\quad`, separates two numbers. */
const thinSpaces = new Set(['\\,', '\\!', '\\thinspace'])

function normalize(nodes: readonly KatexNode[], context: NormalizeContext): TexNode[] {
  const result: TexNode[] = []
  // True after spacing that separates numbers, so `2 \quad 3` stays two numbers.
  let gap = false

  /**
   * Joins a digit node to the number before it, so `9` and `0^\circ` become `90^\circ`. `join` is false when the source
   * separates the digits, as `2 3` or `2 \quad 3`. KaTeX drops that space, so the reader checks the source.
   */
  function pushDigits(digits: string, scripts?: { sub?: TexNode[], sup?: TexNode[] }, join = true) {
    // Every digit and point before joins, not only the last one: in `45.1_{\pm 0.5}` KaTeX gives `45`, `.`, and the
    // scripted `1`, and the number is 45.1.
    let value = digits
    for (let previous = join ? result.at(-1) : undefined; previous?.type === 'symbol' && /^[\d.]+$/.test(previous.value); previous = result.at(-1)) {
      value = previous.value + value
      result.pop()
    }
    result.push(scripts ? { type: 'scripts', base: { type: 'symbol', value }, ...scripts } : { type: 'symbol', value })
  }

  /**
   * Normalizes an argument or a script. KaTeX wraps each one in a group for layout, but the reader needs the tokens,
   * for example `i`, `=`, and `1` of `\sum_{i=1}`.
   */
  function argument(node: KatexNode | null | undefined): TexNode[] {
    if (!node)
      return []
    return fence(normalize(node.type === 'ordgroup' ? asList(node.body) : [node], context))
  }

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    switch (node.type) {
      case 'mathord':
      case 'textord': {
        const value = node.text ?? ''
        const previous = result.at(-1)
        const afterNumber = previous?.type === 'symbol' && /^\d[\d.]*$/.test(previous.value)
        // A point joins a number only between two digits, so a sentence end in `x = 3.` stays a point.
        if (digit.test(value) || (value === '.' && afterNumber && digit.test(nodes[index + 1]?.text ?? ''))) {
          const spaced = gap || (node.loc ? /\s/.test(context.source[node.loc.start - 1] ?? '') : false)
          pushDigits(value, undefined, !spaced)
          gap = false
          break
        }
        if (value === notMark && nodes[index + 1]?.type === 'atom') {
          const relation = nodes[index + 1]!.text ?? ''
          result.push({ type: 'symbol', value: negations[relation] ?? relation })
          index++
          break
        }
        result.push({ type: 'symbol', value: value === '\\@cdots' ? '\\cdots' : escapedSpecials[value] ?? value })
        break
      }
      case 'atom':
        result.push({ type: 'symbol', value: node.text === '\\@cdots' ? '\\cdots' : node.text ?? '' })
        break
      case 'op':
        if (node.name)
          result.push({ type: 'symbol', value: node.name })
        else
          result.push(...normalize(asList(node.body), context))
        break
      case 'supsub': {
        const sub = node.sub ? argument(node.sub) : undefined
        const sup = node.sup ? argument(node.sup) : undefined
        // Delimiters of the base pair here, so `\left(1+x\right)^n` is one fence with the power.
        const base = argument(node.base)
        const scripts = { ...(sub?.length ? { sub } : {}), ...(sup?.length ? { sup } : {}) }
        if (base.length === 1 && base[0]!.type === 'symbol' && /^\d+$/.test(base[0]!.value)) {
          pushDigits(base[0]!.value, scripts)
          break
        }
        // A script on a delimited group belongs to the group, as in `(a+b)^2`, so the reader can say the quantity.
        if (base.length === 1 && base[0]!.type === 'fence') {
          result.push({ ...base[0]!, ...scripts })
          break
        }
        const only = base.length === 1 ? base[0]! : base.length === 0 ? { type: 'symbol' as const, value: '' } : { type: 'group' as const, children: base }
        result.push({ type: 'scripts', base: only, ...scripts })
        break
      }
      case 'genfrac':
        result.push({ type: 'command', name: node.hasBarLine ? 'frac' : 'binom', args: [argument(node.numer), argument(node.denom)] })
        break
      case 'sqrt':
        result.push({ type: 'command', name: 'sqrt', args: [argument(node.body as KatexNode)], ...(node.index ? { option: argument(node.index) } : {}) })
        break
      case 'ordgroup': {
        const children = normalize(asList(node.body), context)
        // KaTeX expands `\colon` to kerns around `{:}`. The braces would hide the colon of a signature such as
        // `p \colon A \to B`, so a group that holds only a colon gives the colon itself. See `defineMacro("\\colon"` in
        // node_modules/katex/src/macros.ts.
        if (children.length === 1 && children[0]!.type === 'symbol' && children[0]!.value === ':')
          result.push(children[0]!)
        else
          result.push({ type: 'group', children })
        break
      }
      case 'leftright': {
        // An array in braces or brackets is `cases` or a matrix. The delimiters only mark the kind, so they are not read.
        const [only] = asList(node.body)
        const kind = asList(node.body).length === 1 && only?.type === 'array' ? arrayKinds[`${node.left}${node.right}`] : undefined
        if (kind) {
          result.push({ ...rowsOf(only!, context), name: kind })
          break
        }
        if (node.left && node.left !== '.')
          result.push({ type: 'symbol', value: node.left })
        result.push(...normalize(asList(node.body), context))
        if (node.right && node.right !== '.')
          result.push({ type: 'symbol', value: node.right })
        break
      }
      case 'font': {
        const font = node.font ?? ''
        if (commandFonts.has(font))
          result.push({ type: 'command', name: font, args: [argument(node.body as KatexNode)] })
        else if (textFonts.has(font))
          result.push({ type: 'text', name: font, value: plainText(asList(node.body)) })
        else
          result.push(...normalize(asList(node.body), context))
        break
      }
      case 'text': {
        const value = plainText(asList(node.body))
        if (value.startsWith(rawMarker)) {
          const lifted = context.raw[Number(value.slice(rawMarker.length))]
          result.push({ type: 'raw', command: lifted?.command ?? '', value: lifted?.value ?? '' })
          break
        }
        result.push({ type: 'text', name: 'text', value })
        break
      }
      case 'operatorname':
        result.push({ type: 'text', name: 'operatorname', value: plainText(asList(node.body)) })
        break
      case 'accent':
        result.push({ type: 'command', name: (node.label ?? '').replace(/^\\/, ''), args: [argument(node.base)] })
        break
      case 'overline':
      case 'underline':
        result.push({ type: 'command', name: node.type, args: [argument(node.body as KatexNode)] })
        break
      case 'mclass': {
        // `\overset{\frown}{AB}` is an operator with the arc above it.
        const inner = asList(node.body)
        const scripts = inner.length === 1 && inner[0]!.type === 'supsub' ? inner[0]! : undefined
        if (scripts?.base?.type === 'op' && scripts.sup) {
          result.push({ type: 'command', name: 'overset', args: [argument(scripts.sup), fence(normalize(asList(scripts.base.body), context))] })
          break
        }
        result.push(...normalize(inner, context))
        break
      }
      case 'htmlmathml': {
        // `\not` is a lone not mark in its own node, and the relation that it negates is the next sibling.
        const mathml = node.mathml ?? []
        const next = nodes[index + 1]
        if (mathml.length === 1 && mathml[0]!.text === notMark && next?.type === 'atom') {
          result.push({ type: 'symbol', value: negations[next.text ?? ''] ?? next.text ?? '' })
          index++
          break
        }
        result.push(...normalize(mathml, context))
        break
      }
      case 'xArrow':
        // A labeled arrow, as in mhchem `->[\Delta]`: the arrow, then its label over and under it.
        result.push({ type: 'command', name: 'xarrow', args: [[{ type: 'symbol', value: node.label ?? '' }], argument(node.body as KatexNode), argument(node.below)] })
        break
      case 'array':
        result.push(rowsOf(node, context))
        break
      default:
        if (silent.has(node.type)) {
          if (node.type === 'kern' || (node.type === 'spacing' && !thinSpaces.has(node.text ?? '')))
            gap = true
          break
        }
        if (transparent.has(node.type) || node.body !== undefined)
          result.push(...normalize(asList(node.body), context))
    }
  }
  return result
}

/**
 * Scientific notation as code writes it, `1e-3` or `2.5e10`, with nothing between the parts. `2e - 1` has spaces, and
 * it is 2e minus 1 with Euler's number. KaTeX drops the spaces, so the rule reads the source.
 */
const scientific = /(?<![\w\\.^])(\d+(?:\.\d+)?)e([+-]?\d+)(?![\w.])/g
/**
 * Digits grouped by commas: `1,000,000` with two groups or more, or `1{,}000` with the brace that TeX needs. One plain
 * comma group, as in `[1,100]`, is a list of two numbers.
 */
const groupedDigits = /(?<![\d.])([1-9]\d{0,2})((?:,\d{3}){2,})(?![\d.])/g
const bracedGroups = /(\d)\{,\}(?=\d{3}(?!\d))/g

/** Rewrites the numbers that TeX cannot tell apart from other notation by tokens alone, see {@link scientific}. */
function rewriteNumbers(source: string): string {
  return source
    .replace(scientific, (_, mantissa: string, exponent: string) => `${mantissa}\\times 10^{${exponent}}`)
    .replace(groupedDigits, (_, head: string, groups: string) => head + groups.replaceAll(',', ''))
    .replace(bracedGroups, '$1')
}

/**
 * Parses TeX math source into the syntax tree of the reader, with KaTeX.
 *
 * The parse is total. Unbalanced braces are balanced first. A formula that KaTeX still cannot parse becomes one text
 * node with its source, so the speech keeps the writer's words instead of failing.
 *
 * `rawCommands` are the commands that extensions read from their source, as `ce` and `pu` of chemistry. They become
 * `raw` nodes with their source, see ./extension.
 */
export function parseMath(source: string, rawCommands: readonly string[] = []): TexNode[] {
  const lifted = liftRaw(rewriteNumbers(balanceBraces(source)), rawCommands)
  let nodes: KatexNode[]
  try {
    nodes = katexParse(lifted.source, { throwOnError: false, strict: false })
  }
  catch {
    return [{ type: 'text', name: 'text', value: source.replace(/\\([a-z]+)/gi, '$1').replace(/[{}\\]/g, ' ').replace(/\s+/g, ' ').trim() }]
  }
  return fence(normalize(nodes, { raw: lifted.raw, source: lifted.source }))
}
