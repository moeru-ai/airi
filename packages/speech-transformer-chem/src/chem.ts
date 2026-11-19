import type { MathJson } from '@proj-airi/mathjson'
import type { MathLocale, TexNode } from '@proj-airi/speech-transformer-math'

import type { ChemLocale, ChemSpecies } from './locale'

import { argsOf, headOf, isFunction, isNumber, nothing, text, textOf } from '@proj-airi/mathjson'
import { parseMath } from '@proj-airi/speech-transformer-math'
import { mhchemParser } from 'mhchemparser'

/** The mhchem arrows that mhchemParser writes, mapped to the three readings that the lexicons have. */
const arrows: Readonly<Record<string, '->' | '<=>' | '<-'>> = {
  '\\longrightarrow': '->',
  '\\rightarrow': '->',
  '\\xrightarrow': '->',
  '\\longleftarrow': '<-',
  '\\xleftarrow': '<-',
  '\\longrightleftharpoons': '<=>',
  '\\xrightleftharpoons': '<=>',
  '\\rightleftharpoons': '<=>',
  '\\longleftrightarrow': '<=>',
  '\\xleftrightarrow': '<=>',
  '\\longLeftrightharpoons': '<=>',
  '\\longRightleftharpoons': '<=>',
}
const gasMarks = new Set(['\\uparrow', '↑'])
const precipitateMarks = new Set(['\\downarrow', '↓'])
const states = new Set(['s', 'l', 'g', 'aq'])
const heat = new Set(['\\Delta', 'Δ'])

/** One species while its tokens are read. `core` is the formula without charge, for example `Ca(OH)2`. */
interface Draft {
  coefficient?: string
  core: string
  charge?: string
  state?: string
}

/** Reads the characters of a script, for example `2` of `_{2}` or `3+` of `^{3+}`. */
function scriptText(nodes: readonly TexNode[] | undefined): string {
  return (nodes ?? []).map(node => node.type === 'symbol' ? node.value : node.type === 'group' ? scriptText(node.children) : '').join('')
}

/** Rebuilds the formula of tokens, for example `(OH)2` from a fence of `\mathrm{OH}` and its count. */
function formulaText(nodes: readonly TexNode[]): string {
  return nodes.map((node) => {
    if (node.type === 'text')
      return node.value
    if (node.type === 'fence')
      return `(${formulaText(node.children)})${scriptText(node.sub)}`
    if (node.type === 'scripts')
      return scriptText(node.sub)
    return ''
  }).join('')
}

function species(draft: Draft): MathJson {
  const formula = draft.charge ? `${draft.core}^${draft.charge}` : draft.core
  return ['Species', text(formula), draft.coefficient ? { num: draft.coefficient } : nothing, draft.state ? text(draft.state) : nothing]
}

/**
 * Lowers the content of `\ce{}` or `\pu{}` into a `Chemistry` expression.
 *
 * mhchemParser turns the mhchem source into TeX, and KaTeX parses that TeX, so this module only rebuilds species from
 * the tokens. The shape is:
 *
 * - `["Chemistry", ["Reaction", arrow, ["Side", ...terms], ["Side", ...terms], condition]]` for an equation.
 * - `["Chemistry", ["Side", ...terms]]` for formulas alone.
 * - A term is `["Species", formula, coefficient, state]`, or `["Hydrate", ...species]`, wrapped in `Gas` or
 *   `Precipitate` when mhchem marks it.
 */
export function lowerChemistry(source: string): MathJson {
  let tex: string
  try {
    tex = mhchemParser.toTex(source, 'ce')
  }
  catch {
    // mhchemParser rejects some input. The source is then read as written.
    return ['Chemistry', ['Side', ['Text', text(source)]]]
  }

  const tokens = parseMath(tex).flatMap(node => node.type === 'group' ? node.children : [node])
  const sides: MathJson[][] = [[]]
  let arrow: '->' | '<=>' | '<-' | undefined
  let condition: MathJson = nothing
  let hydrate: MathJson[] = []
  let draft: Draft | undefined
  let coefficient: string | undefined

  const endSpecies = () => {
    if (draft)
      hydrate.push(species(draft))
    draft = undefined
  }
  const endTerm = () => {
    endSpecies()
    if (hydrate.length === 1)
      sides.at(-1)!.push(hydrate[0]!)
    else if (hydrate.length > 1)
      sides.at(-1)!.push(['Hydrate', ...hydrate])
    hydrate = []
  }
  const mark = (head: 'Gas' | 'Precipitate') => {
    endTerm()
    const side = sides.at(-1)!
    if (side.length > 0)
      side.push([head, side.pop()!])
  }
  const arrowOf = (token: TexNode): string | undefined => {
    if (token.type === 'symbol' || token.type === 'text')
      return token.value.trim()
    const label = token.type === 'command' && token.name === 'xarrow' ? token.args[0]?.[0] : undefined
    return label?.type === 'symbol' ? label.value : undefined
  }

  for (const token of tokens) {
    if (token.type === 'group' && token.children.length === 0)
      continue

    // An arrow ends the left side. A labeled arrow carries its condition.
    const arrowName = arrowOf(token)
    if (arrowName !== undefined && arrows[arrowName] !== undefined) {
      endTerm()
      arrow = arrows[arrowName]
      if (token.type === 'command') {
        const label = token.args[1] ?? []
        const only = label.length === 1 ? label[0]! : undefined
        const labelText = only?.type === 'text' || only?.type === 'symbol' ? only.value.trim() : undefined
        if (labelText !== undefined && heat.has(labelText))
          condition = ['Heat']
        else if (label.length > 0)
          condition = ['Text', text(formulaText(label) || scriptText(label))]
      }
      sides.push([])
      continue
    }

    if (token.type === 'symbol' && token.value === '+') {
      endTerm()
      continue
    }
    if (token.type === 'symbol' && gasMarks.has(token.value)) {
      mark('Gas')
      continue
    }
    if (token.type === 'symbol' && precipitateMarks.has(token.value)) {
      mark('Precipitate')
      continue
    }
    // The dot of a hydrate, `CuSO4*5H2O`, starts the next formula of the same term.
    if (token.type === 'group' && token.children.some(child => child.type === 'symbol' && child.value === '\\cdot')) {
      endSpecies()
      continue
    }
    if (token.type === 'symbol' && /^\d+(?:\/\d+)?$/.test(token.value) && !draft) {
      coefficient = token.value
      continue
    }
    // A state follows its formula in parentheses, as `(l)` of `H2O(l)`.
    const only = token.type === 'fence' && token.children.length === 1 ? token.children[0]! : undefined
    if (draft && only?.type === 'text' && states.has(only.value)) {
      draft.state = only.value
      continue
    }
    if (token.type === 'scripts' && draft) {
      if (token.sub?.length)
        draft.core += scriptText(token.sub)
      if (token.sup?.length)
        draft.charge = scriptText(token.sup)
      continue
    }
    if (token.type === 'text' || token.type === 'fence') {
      draft ??= { core: '', coefficient }
      coefficient = undefined
      draft.core += formulaText([token])
    }
  }
  endTerm()

  if (arrow === undefined)
    return ['Chemistry', ['Side', ...sides[0]!]]
  return ['Chemistry', ['Reaction', text(arrow), ['Side', ...sides[0]!], ['Side', ...(sides[1] ?? [])], condition]]
}

/**
 * Reads a formula symbol by symbol: each element by its letters, each count as a number, and the parentheses of a
 * group as words, for example `Ca(OH)2` as "C A open parenthesis O H close parenthesis two".
 */
function spellFormula(core: string, lexicon: MathLocale, chem: ChemLocale): string {
  const words: string[] = []
  for (const match of core.matchAll(/([A-Z][a-z]?)(\d*)|\((?=[A-Z])|\)(\d*)/g)) {
    const [token, element, count, groupCount] = match
    if (element !== undefined) {
      words.push(...[...element].map(letter => lexicon.letter(letter.toUpperCase())))
      if (count)
        words.push(lexicon.number(count))
    }
    else if (token === '(') {
      words.push(chem.open)
    }
    else {
      words.push(chem.close)
      if (groupCount)
        words.push(lexicon.number(groupCount))
    }
  }
  return words.join(' ')
}

function chemSpecies(expression: MathJson): ChemSpecies {
  const [formula = nothing, coefficient = nothing, state = nothing] = argsOf(expression)
  const source = textOf(formula)
  const [core = '', charge] = source.split('^')
  return { formula: source, core, charge, coefficient: isNumber(coefficient) ? coefficient.num : undefined, state: textOf(state) || undefined }
}

/**
 * Reads a `Chemistry` expression.
 *
 * A formula alone keeps its symbols, because the text around it usually names it already, as in "the formula of
 * sulfuric acid is H2SO4". An equation reads each species by its name when the lexicon has one, and adds the
 * coefficient 1 where the language reads it.
 */
export function speakChemistry(expression: MathJson, lexicon: MathLocale, chem: ChemLocale): string {
  function symbols(item: ChemSpecies): string {
    return chem.spellsFormula ? spellFormula(item.core, lexicon, chem) : chem.formula({ ...item, formula: item.core })
  }

  function name(item: ChemSpecies): string {
    return chem.names[item.formula] ?? symbols(item) + (item.charge ? ` ${chem.ion('', item.charge, true).trim()}` : '')
  }

  function alone(item: ChemSpecies): string {
    const formula = symbols(item)
    return item.charge ? chem.ion(formula, item.charge, false) : formula
  }

  function term(value: MathJson, inEquation: boolean): string {
    const head = headOf(value)
    if (head === 'Gas' || head === 'Precipitate')
      return lexicon.join([term(argsOf(value)[0] ?? nothing, inEquation), head === 'Gas' ? chem.gas : chem.precipitate])
    if (head === 'Text')
      return textOf(argsOf(value)[0] ?? nothing)
    const parts = head === 'Hydrate' ? argsOf(value) : [value]
    // A school hydrate in an equation has one name for the whole formula, as 五水合硫酸铜 for `CuSO4*5H2O`. A hydrate
    // alone keeps its symbols: the formula speech eval heard 五水和物 as 無水和物, the opposite meaning.
    if (inEquation && parts.length > 1) {
      const species = parts.map(chemSpecies)
      const whole = chem.names[species.map((item, index) => index === 0 ? item.formula : `${item.coefficient ?? ''}${item.formula}`).join('*')]
      if (whole !== undefined)
        return chem.term(whole, species[0]!.coefficient && lexicon.number(species[0]!.coefficient))
    }
    const spoken = parts.map((part, index) => {
      const item = chemSpecies(part)
      const reading = inEquation ? name(item) : alone(item)
      const coefficient = item.coefficient && lexicon.number(item.coefficient)
      // The first coefficient of a hydrate belongs to the term, the others to their formula.
      if (inEquation && index === 0)
        return chem.term(reading, coefficient)
      return coefficient ? lexicon.join([coefficient, reading]) : reading
    })
    // Spaces keep the dot apart also in a compact language, where よんドットご would run together.
    return spoken.join(` ${chem.hydrate} `)
  }

  function side(value: MathJson, inEquation: boolean): string {
    const terms = argsOf(value).map(item => term(item, inEquation))
    if (terms.length === 0)
      return ''
    // Three or more names join as a list, then "and" before the last: 锰酸钾、二氧化锰 和 氧气. A language that spells
    // formulas joins them with plus, as "A plus B plus C", so it keeps the pairwise join.
    return terms.length > 2 && !chem.spellsFormula ? chem.and(lexicon.list(terms.slice(0, -1)), terms.at(-1)!) : terms.reduce((left, right) => chem.and(left, right))
  }

  const content = argsOf(expression)[0] ?? nothing
  if (!isFunction(content, 'Reaction'))
    return side(content, false)

  const [arrow = nothing, left = nothing, right = nothing, condition = nothing] = argsOf(content)
  const decomposition = textOf(arrow) === '->' && argsOf(left).length === 1 && argsOf(right).length >= 2
  const read = (decomposition ? chem.decompose : undefined) ?? chem.arrow[textOf(arrow)]!
  const equation = read(side(left, true), side(right, true))
  if (condition === nothing)
    return equation
  const spokenCondition = headOf(condition) === 'Heat' ? chem.heat : textOf(argsOf(condition)[0] ?? nothing)
  return chem.condition(spokenCondition, equation)
}
