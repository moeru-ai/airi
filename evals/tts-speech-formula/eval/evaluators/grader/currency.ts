import type { CurrencyItem } from '../../cases/formula-speech/cases'

import { canonicalize } from './normalize'

/** A dollar amount with a sign before it (`$5`, `US$5`, `USD 5`), or a word after it (`5 dollars`, `5美元`). */
const amount = /(?:\$|USD|US\$)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|USD|美元|美金|ドル|달러)/g

/**
 * Lists the US dollar amounts in a sentence, sorted.
 *
 * @example
 * dollarAmounts('Apples cost \\$3, and rent is 1,200 dollars')
 * // => [3, 1200]
 */
export function dollarAmounts(text: string): number[] {
  const normalized = text.replaceAll('\\$', '$').replaceAll('＄', '$')
  return [...normalized.matchAll(amount)]
    .map(match => Number((match[1] ?? match[2]!).replaceAll(',', '')))
    .sort((left, right) => left - right)
}

/** Tells whether a sentence keeps every dollar amount, and no other amount, and every inline formula of the reference. */
export function sameCurrencySentence(reference: readonly CurrencyItem[], hypothesis: string): boolean {
  const expected = reference.flatMap(item => item[0] === 'USD' ? [item[1]] : []).sort((left, right) => left - right)
  const actual = dollarAmounts(hypothesis)
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index]))
    return false

  const sentence = canonicalize(hypothesis)
  return reference.every(item => item[0] !== 'MATH' || sentence.includes(canonicalize(item[1])))
}
