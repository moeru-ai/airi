/**
 * Language catalogue backing the bilingual subtitle feature.
 *
 * Adding support for another language pair means adding one entry here: the
 * settings dropdown, the generated system prompt, and the output parser all
 * read from this list.
 */

/** ISO 639-1 code of a language the bilingual feature can emit. */
export type BilingualLanguageCode = 'en' | 'zh' | 'ja'

export interface BilingualLanguage {
  /** ISO 639-1 code. Persisted as the settings value. */
  code: BilingualLanguageCode
  /** Name shown in the settings dropdown, written in the language itself. */
  display: string
  /** Tag the model is asked to prefix each segment with, e.g. `EN`. */
  tag: string
}

/** Persisted value meaning "do not render this subtitle line". */
export const BILINGUAL_NONE = 'none'

export const BILINGUAL_LANGUAGES: readonly BilingualLanguage[] = [
  { code: 'en', display: 'English', tag: 'EN' },
  { code: 'zh', display: '中文', tag: 'CN' },
  { code: 'ja', display: '日本語', tag: 'JA' },
]

/**
 * Resolves one catalogue entry from a persisted settings value.
 *
 * Returns `undefined` for an empty value, an unknown code, and
 * {@link BILINGUAL_NONE}, so callers can treat "turned off" and
 * "unrecognised" as the same case.
 */
export function resolveBilingualLanguage(value: string | undefined | null): BilingualLanguage | undefined {
  if (!value)
    return undefined

  return BILINGUAL_LANGUAGES.find(language => language.code === value)
}
