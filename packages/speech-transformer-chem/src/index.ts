import type { MathSpeechExtension } from '@proj-airi/speech-transformer-math'

import type { ChemLocale } from './locale'

import { lowerChemistry, speakChemistry } from './chem'
import { en } from './locales/en'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { zh } from './locales/zh'

export { lowerChemistry, speakChemistry } from './chem'
export type { ChemLocale, ChemSpecies } from './locale'
// Named apart from the math packs, so one file can import both.
export { en as enChem, ja as jaChem, ko as koChem, zh as zhChem }

/** The built-in chemistry locales: Chinese, English, Japanese, and Korean. */
export const builtinChemLocales: readonly ChemLocale[] = [en, ja, ko, zh]

export interface ChemistryOptions {
  /** The chemistry locales, matched to a math locale pack by language. The default is {@link builtinChemLocales}. */
  locales?: readonly ChemLocale[]
  /** The language of the locale that reads a language without one. The default is `en`. */
  fallbackLanguage?: string
}

/**
 * Reads mhchem `\ce{}` and `\pu{}` as chemistry, as an extension of `MathSpeech`.
 *
 * @example
 * const speech = new MathSpeech({ extensions: [chemistry()] })
 * speech.speak(String.raw`\ce{2H2 + O2 -> 2H2O}`, 'zh')
 * // => '氢气 和 氧气 反应生成 水'
 */
export function chemistry(options: ChemistryOptions = {}): MathSpeechExtension {
  const locales = new Map((options.locales ?? builtinChemLocales).map(locale => [locale.language, locale]))
  const fallback = options.fallbackLanguage ?? 'en'
  return {
    name: 'chemistry',
    rawCommands: ['ce', 'pu'],
    lower: (_, source) => lowerChemistry(source),
    render: {
      Chemistry: (expression, { lexicon }) => {
        const locale = locales.get(lexicon.language) ?? locales.get(fallback)
        if (!locale)
          throw new Error(`No chemistry locale reads ${lexicon.language}, and the fallback ${fallback} has none.`)
        return speakChemistry(expression, lexicon, locale)
      },
    },
  }
}
