/** The languages that the suite reads every case in. */
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

export const languageName: Readonly<Record<Language, string>> = {
  zh: 'Mandarin Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
}
