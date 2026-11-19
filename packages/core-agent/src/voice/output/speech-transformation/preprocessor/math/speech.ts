import type { MathJson } from '@proj-airi/mathjson'

import { chemistry } from '@proj-airi/speech-transformer-chem'
import { MathSpeech } from '@proj-airi/speech-transformer-math'

/**
 * The formula reader of AIRI: the built-in locale packs of `@proj-airi/speech-transformer-math`, with chemistry.
 * A contributor adds or changes a language with `mathSpeech.register`.
 */
export const mathSpeech = new MathSpeech({ extensions: [chemistry()] })

/** Reads TeX math source as words of one language. `\ce{}` is read as chemistry. See {@link MathSpeech.speak}. */
export function speakMath(tex: string, language: string): string {
  return mathSpeech.speak(tex, language)
}

/** Lowers TeX math source into MathJSON, without reading it. See {@link MathSpeech.toMathJson}. */
export function toMathJson(tex: string): MathJson {
  return mathSpeech.toMathJson(tex)
}
