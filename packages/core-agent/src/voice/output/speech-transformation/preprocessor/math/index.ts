import type { SpeechPreprocessor } from '../types'

import { braceBareScripts, findBareLatex } from './bare-latex'
import { speakMath } from './speech'

export { mathSpeech, speakMath, toMathJson } from './speech'

/**
 * Reads TeX formulas, chemistry in `\ce{}`, and units as words.
 *
 * Formulas go through `mathSpeech`, see ./speech. In prose, the plugin also finds TeX without delimiters, for example
 * `\ce{H2O}`, and reads it as a formula.
 */
export function mathSpeechPreprocessor(): SpeechPreprocessor {
  return {
    name: 'math',
    formula: (tex, { language }) => speakMath(tex, language),
    prose: (text, { readFormula }) => {
      const spans = findBareLatex(text)
      if (spans.length === 0)
        return text

      const context = spans.reduceRight((rest, { start, end }) => rest.slice(0, start) + rest.slice(end), text)
      let result = ''
      let last = 0
      for (const { start, end } of spans) {
        result += text.slice(last, start) + readFormula(braceBareScripts(text.slice(start, end)), context)
        last = end
      }
      return result + text.slice(last)
    },
  }
}
