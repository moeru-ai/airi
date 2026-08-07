/**
 * Represents a supported language definition for bilingual output routing.
 */
export interface BilingualLanguage {
  /** Two-letter ISO 639-1 language code (e.g., 'en', 'zh'). */
  code: string
  /** Human-readable display name of the language. */
  name: string
  /** Tag used in prompt formatting and routing for this language (e.g., '[EN]'). */
  tag: string
}

/**
 * List of supported languages for bilingual subtitle generation and speech routing.
 */
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

/**
 * Retrieves the bilingual language metadata for a given language code.
 *
 * @example
 * getBilingualLanguage('en')
 * // => { code: 'en', name: 'English', tag: '[EN]' }
 *
 * @param code - Two-letter language code to look up.
 * @returns The matching language object, or `undefined` if not found.
 */
export function getBilingualLanguage(code: string): BilingualLanguage | undefined {
  return BILINGUAL_LANGUAGES.find(lang => lang.code === code)
}
