import { primaryLanguage } from '@proj-airi/speech-transformer-math'

/** The primary language subtag of a BCP 47 code, see `primaryLanguage` of `@proj-airi/speech-transformer-math`. */
export function toSpeechLanguage(code: string | undefined): string | undefined {
  return code === undefined ? undefined : primaryLanguage(code) || undefined
}

const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u
const hangul = /\p{Script=Hangul}/u
const han = /\p{Script=Han}/u
const latinWord = /[a-z]{2,}/i

/**
 * Selects the language of a formula or a price from the words around it, as a primary language subtag.
 * Han characters without kana are Chinese, unless the voice is Japanese.
 */
export function detectSpeechLanguage(context: string, fallback?: string): string {
  if (kana.test(context))
    return 'ja'
  if (hangul.test(context))
    return 'ko'
  if (han.test(context))
    return fallback === 'ja' ? 'ja' : 'zh'
  if (latinWord.test(context))
    return 'en'
  return fallback ?? 'en'
}
