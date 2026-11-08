import type { SpeechPreprocessor } from '../types'

import { escapePrices, speakPrices } from './prices'

export { escapePrices, speakPrices } from './prices'

/**
 * Reads dollar amounts in prose as words of their sentence, for example `$3` as "three dollars".
 *
 * Before parsing, it escapes the `$` of a price with the Pandoc rule, so `$5 and $10` is not a formula.
 * Inline code keeps its prices as written.
 */
export function moneySpeechPreprocessor(): SpeechPreprocessor {
  return {
    name: 'money',
    prepare: escapePrices,
    prose: (text, { kind, language }) => kind === 'text' ? speakPrices(text, language) : text,
  }
}
