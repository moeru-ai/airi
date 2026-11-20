/** The languages of the suite. Each case is written in one of them, because each community writes its own emoticons. */
export const languages = [
  'zh',
  'en',
  'ja',
  'ko',
] as const

export type Language = typeof languages[number]

/** BCP 47 code that AIRI uses for the voice of each language. */
export const voiceLanguage: Readonly<Record<Language, string>> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
}
