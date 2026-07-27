export interface BilingualLanguage {
  code: string
  name: string
  tag: string
}

export const BILINGUAL_LANGUAGES: BilingualLanguage[] = [
  { code: 'en', name: 'English', tag: '[EN]' },
  { code: 'zh', name: '中文', tag: '[ZH]' },
  { code: 'ja', name: '日本語', tag: '[JA]' },
  { code: 'es', name: 'Español', tag: '[ES]' },
  { code: 'fr', name: 'Français', tag: '[FR]' },
  { code: 'de', name: 'Deutsch', tag: '[DE]' },
  { code: 'ko', name: '한국어', tag: '[KO]' },
  { code: 'ru', name: 'Русский', tag: '[RU]' },
  { code: 'pt', name: 'Português', tag: '[PT]' },
  { code: 'it', name: 'Italiano', tag: '[IT]' },
]

export function getBilingualLanguage(code: string): BilingualLanguage | undefined {
  return BILINGUAL_LANGUAGES.find(lang => lang.code === code)
}
