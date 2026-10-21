import { codeSpans } from '../../markdown'
import { moneyLocale } from './locales'

/** A dollar amount after `$`, with optional grouping commas and cents, for example `$1,200` or `$19.99`. */
const priceSource = String.raw`\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`
/** A price ends at a space, punctuation, CJK text, or the end. `$5\%$` and `$5$` are formulas, not prices. */
const priceEndSource = String.raw`(?=$|[\s,.;:!?)\]、，。！？）」』\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])`
const price = new RegExp(`^${priceSource}${priceEndSource}`, 'u')
const prices = new RegExp(`${priceSource}${priceEndSource}`, 'gu')

/**
 * Returns true when the `$` after `from` closes an inline formula by the Pandoc rule: no space before it, and no digit
 * after it. The search stops at a blank line, because a formula does not cross paragraphs.
 */
function closesFormula(text: string, from: number): boolean {
  for (let index = from; index < text.length; index++) {
    if (text[index] === '\n' && text[index + 1] === '\n')
      return false
    if (text[index] === '\\') {
      index++
      continue
    }
    if (text[index] === '$')
      return !/\s/.test(text[index - 1] ?? ' ') && !/\d/.test(text[index + 1] ?? '')
  }
  return false
}

/**
 * Escapes the `$` of a price, outside code, so the markdown parser keeps it as text.
 *
 * remark-math pairs any two `$`, so `$5, and the area is $x^2$` became one formula from `$5` to `$x`. A `$` that starts
 * a price, and whose next `$` cannot close a formula, is a price. `$2 + 3$` stays a formula.
 *
 * @example
 * escapePrices('A ticket is $5, and the area is $x^2$.')
 * // => 'A ticket is \\$5, and the area is $x^2$.'
 */
export function escapePrices(markdown: string): string {
  return markdown
    .split(codeSpans)
    .map((part, index) => {
      if (index % 2 === 1)
        return part
      let result = ''
      let last = 0
      for (let at = 0; at < part.length; at++) {
        if (part[at] !== '$' || part[at - 1] === '\\')
          continue
        if (part[at + 1] === '$') {
          // `$$` opens or closes display math.
          at++
          continue
        }
        const match = price.exec(part.slice(at))
        if (!match || closesFormula(part, at + match[0].length))
          continue
        result += `${part.slice(last, at)}\\`
        last = at
      }
      return result + part.slice(last)
    })
    .join('')
}

/**
 * Reads the dollar amounts of a text as words of one language.
 *
 * @example
 * speakPrices('Apples cost $3.', 'en')
 * // => 'Apples cost three dollars.'
 */
export function speakPrices(text: string, language: string): string {
  const locale = moneyLocale(language)
  return text.replace(prices, match => locale.dollars(match.slice(1).replaceAll(',', '')))
}
