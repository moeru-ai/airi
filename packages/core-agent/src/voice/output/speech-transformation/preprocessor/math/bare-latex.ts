import { mathSpeech } from './speech'

/** Commands that start a formula in plain text. Unknown commands, such as a path `C:\Users`, do not. */
const knownCommands = new Set([
  ...Object.keys(mathSpeech.locale('en').words),
  ...Object.keys(mathSpeech.locale('en').relations),
  ...Object.keys(mathSpeech.locale('en').operators),
  // The commands of extensions, for example `\ce` of chemistry.
  ...mathSpeech.rawCommands.map(command => `\\${command}`),
  ...['frac', 'dfrac', 'tfrac', 'sqrt', 'text', 'mathrm', 'mathbb', 'overline', 'vec', 'hat', 'left', 'right', 'sum', 'prod', 'int', 'binom', 'overset', 'prime', 'circ'].map(name => `\\${name}`),
].filter(key => key.startsWith('\\')))

/** One symbol that can continue a formula: an operator, a digit, an uppercase name, or one lowercase letter. */
const mathToken = /^(?:\s+|\d+(?:\.\d+)?|[A-Z]+|[a-z](?![a-z])|[=+\-*/<>()|'!^_[\]∞⊥∥≤≥≠≈∈∉⊆⊂∠△°±×÷→])/
const trigger = /\\([a-z]+)|[a-z0-9)]\^[{\w]|_\{/gi

function readBalanced(text: string, start: number): number {
  let depth = 0
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') {
      index++
      continue
    }
    if (text[index] === '{')
      depth++
    if (text[index] === '}' && --depth === 0)
      return index + 1
  }
  return text.length
}

/** Finds TeX that a reply writes without delimiters, for example `设 \alpha 为锐角` or `\ce{H2O}`. */
export function findBareLatex(text: string): { start: number, end: number }[] {
  const spans: { start: number, end: number }[] = []
  for (const match of text.matchAll(trigger)) {
    if (match.index < (spans.at(-1)?.end ?? 0))
      continue
    if (match[1] !== undefined && !knownCommands.has(`\\${match[1]}`))
      continue

    // Extend left over the operand before the trigger, for example `a` in `a \leq b`.
    let start = match.index
    while (start > 0) {
      const before = text.slice(0, start)
      const token = /(?:\s+|\d+(?:\.\d+)?|[A-Z]+|(?<![a-z])[a-z]|[=+\-*/<>()|'!^_])$/.exec(before)
      if (!token || before.length - token[0].length < (spans.at(-1)?.end ?? 0))
        break
      start -= token[0].length
    }

    let end = match.index
    while (end < text.length) {
      const rest = text.slice(end)
      if (rest[0] === '\\') {
        end += /^\\(?:[a-z]+|.)/i.exec(rest)![0].length
        continue
      }
      if (rest[0] === '{') {
        end = readBalanced(text, end)
        continue
      }
      const token = mathToken.exec(rest)
      if (!token)
        break
      end += token[0].length
    }

    while (start < end && /\s/.test(text[start]!))
      start++
    while (end > start && /\s/.test(text[end - 1]!))
      end--
    if (end > start)
      spans.push({ start, end })
  }
  return spans
}

/**
 * Braces a multi-digit script in TeX that a reply writes without delimiters.
 * TeX applies `^` and `_` to one character, but `2^10` in plain text means 2 to the 10th power.
 * Formulas inside `$` keep the TeX rule, because the renderer shows them by that rule.
 *
 * @example
 * braceBareScripts('2^10 + x_12')
 * // => '2^{10} + x_{12}'
 */
export function braceBareScripts(tex: string): string {
  return tex.replace(/([\^_])(\d{2,}(?:\.\d+)?|\d+\.\d+)/g, '$1{$2}')
}
