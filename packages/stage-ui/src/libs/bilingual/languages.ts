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

/**
 * Spellings models actually emit for each catalogue entry.
 *
 * The prompt shows exactly one tag per language, but models freely answer with
 * ISO codes, locales or English names. Anything missing here is treated as
 * literal text, which puts both the tag and the wrong language on the speech
 * engine.
 */
const TAG_ALIASES: Record<string, BilingualLanguageCode> = {
  EN: 'en',
  ENG: 'en',
  ENGLISH: 'en',

  CN: 'zh',
  ZH: 'zh',
  CHI: 'zh',
  ZHO: 'zh',
  CHINESE: 'zh',
  中文: 'zh',
  汉语: 'zh',

  JA: 'ja',
  JP: 'ja',
  JPN: 'ja',
  JAPANESE: 'ja',
  日本語: 'ja',
}

/**
 * Resolves a language tag as the model wrote it, i.e. the inside of `[ZH]`.
 *
 * Locales such as `zh-Hans` or `en_US` are accepted by falling back to the part
 * before the first separator, so a model that ignores the prompt's spelling
 * still gets its segments routed instead of read aloud.
 *
 * Returns `undefined` when the tag matches no catalogue entry.
 */
export function resolveBilingualLanguageByTag(value: string): BilingualLanguage | undefined {
  const tag = value.trim().toUpperCase()
  if (!tag)
    return undefined

  for (const candidate of [tag, tag.split(/[-_\s]/)[0]]) {
    const code = TAG_ALIASES[candidate]
    if (code)
      return BILINGUAL_LANGUAGES.find(language => language.code === code)
  }

  return undefined
}
