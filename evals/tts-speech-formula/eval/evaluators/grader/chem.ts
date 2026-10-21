import { stripWrappers } from './normalize'

type Arrow = '<=>' | '->'

/** The reversible class is tried first, because `<=>` also contains `=` and `->`-like text. */
const arrows: readonly (readonly [RegExp, Arrow])[] = [
  [/<=>|<->|\\rightleftharpoons|\\leftrightarrow|⇌|↔|\\rightleftarrows/, '<=>'],
  // `=` is the arrow of Chinese textbooks.
  [/->|→|\\rightarrow|\\longrightarrow|\\to(?![a-z])|=(?!=)|\\xrightarrow\{[^}]*\}|-\[[^\]]*\]>/, '->'],
]

const uppercase = /\p{Lu}/u
const lowercase = /\p{Ll}/u
const digit = /\d/

function readCount(text: string, start: number): [count: number, end: number] {
  let end = start
  while (end < text.length && digit.test(text[end]!))
    end++
  return [end > start ? Number(text.slice(start, end)) : 1, end]
}

/** Counts the elements of a formula from `start` to the closing bracket of the current group. */
function readGroup(text: string, start: number): [counts: Map<string, number>, end: number] {
  const counts = new Map<string, number>()
  let index = start
  while (index < text.length) {
    const char = text[index]!
    if (char === '(' || char === '[') {
      const [inner, afterGroup] = readGroup(text, index + 1)
      const [multiplier, afterCount] = readCount(text, afterGroup)
      for (const [element, count] of inner)
        counts.set(element, (counts.get(element) ?? 0) + count * multiplier)
      index = afterCount
    }
    else if (char === ')' || char === ']') {
      return [counts, index + 1]
    }
    else if (uppercase.test(char)) {
      const element = char + (index + 1 < text.length && lowercase.test(text[index + 1]!) ? text[index + 1]! : '')
      const [count, afterCount] = readCount(text, index + element.length)
      counts.set(element, (counts.get(element) ?? 0) + count)
      index = afterCount
    }
    else {
      index++
    }
  }
  return [counts, index]
}

/**
 * Keys one species by its element counts, so `Ca(OH)2` and `CaO2H2` are the same species.
 * A hydrate such as `CuSO4*5H2O` adds the water of crystallization.
 */
function speciesKey(formula: string): string {
  const total = new Map<string, number>()
  for (const part of formula.split(/\\cdot|\\bullet|[*·.•⋅]/)) {
    const trimmed = part.trim()
    const [multiplier, start] = readCount(trimmed, 0)
    const [counts] = readGroup(trimmed.slice(start), 0)
    for (const [element, count] of counts)
      total.set(element, (total.get(element) ?? 0) + count * multiplier)
  }
  return [...total].map(([element, count]) => `${element}${count}`).sort().join(' ')
}

/** Parses an equation into its arrow class and one multiset of `(coefficient, species)` per side. */
function parseChem(source: string): { arrow: Arrow | undefined, sides: Map<string, number>[] } {
  let text = stripWrappers(source)
  text = /\\ce\{(.*)\}/s.exec(text)?.[1] ?? text
  // State marks, gas and precipitate marks, and text notes do not change the species.
  text = text.replace(/\\text\{[^}]*\}|\^\{?[\\a-z]*\}?(?![0-9+-])|\s+v(?=\s|$)|↑|↓|\(g\)|\(s\)|\(aq\)|\(l\)/g, ' ')
  text = text.replace(/_\{?(\d+)\}?/g, '$1')

  let arrow: Arrow | undefined
  let parts = [text]
  for (const [pattern, name] of arrows) {
    const match = pattern.exec(text)
    if (match) {
      arrow = name
      parts = [text.slice(0, match.index), text.slice(match.index + match[0].length)]
      break
    }
  }

  const sides = parts.map((side) => {
    const terms = new Map<string, number>()
    for (const term of side.split(/\s\+\s|\s*\+\s*(?=[0-9A-Z(])/)) {
      const trimmed = term.trim()
      if (!trimmed)
        continue
      const match = /^(\d+)\s*(?=[A-Z([])(.+)$/.exec(trimmed)
      const coefficient = match ? Number(match[1]) : 1
      const formula = match ? match[2]! : trimmed
      if (!/[A-Z]/.test(formula))
        continue
      const key = `${coefficient}|${speciesKey(formula)}`
      terms.set(key, (terms.get(key) ?? 0) + 1)
    }
    return terms
  })
  return { arrow, sides }
}

function sameMultiset(left: Map<string, number>, right: Map<string, number>): boolean {
  return left.size === right.size && [...left].every(([key, count]) => right.get(key) === count)
}

/** The species of a side without their coefficients. */
function speciesOf(side: Map<string, number>): Set<string> {
  return new Set([...side.keys()].map(key => key.split('|')[1]!))
}

/**
 * Tells whether two chemical equations have the same species, coefficients, and arrow class.
 * The order of terms is free. A wrong species (CO for CO2), coefficient, or arrow class fails.
 *
 * A hypothesis without any coefficient passes with the same species and arrow. Chinese, Japanese, and Korean readings
 * name the substances of an equation without coefficients, as a textbook does, so the listener cannot hear them. A
 * hypothesis that writes coefficients must write the right ones.
 */
export function sameChemistry(reference: string, hypothesis: string): boolean {
  const expected = parseChem(reference)
  const actual = parseChem(hypothesis)
  if (expected.arrow !== actual.arrow || expected.sides.length !== actual.sides.length)
    return false
  if (expected.sides.every((side, index) => sameMultiset(side, actual.sides[index]!)))
    return true
  const withoutCoefficients = actual.sides.every(side => [...side.keys()].every(key => key.startsWith('1|')))
  return withoutCoefficients && expected.sides.every((side, index) => {
    const left = speciesOf(side)
    const right = speciesOf(actual.sides[index]!)
    return left.size === right.size && [...left].every(species => right.has(species))
  })
}
