/**
 * The primary language subtag of a BCP 47 code: `zh` for `zh-CN`, `ko` for `ko_KR`. Chinese dialect codes are `zh`,
 * because the readers have one Chinese pack.
 */
export function toSpeechLanguage(code: string | undefined): string | undefined {
  if (code === undefined)
    return undefined
  const primary = code.toLowerCase().split(/[-_]/)[0] ?? ''
  if (primary === 'cmn' || primary === 'yue')
    return 'zh'
  return primary || undefined
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
