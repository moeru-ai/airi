/** The words that read the symbols of an address or a file path in one language. */
export interface TokenLocale {
  dot: string
  slash: string
  backslash: string
  colon: string
  tilde: string
  port: string
}

/** The token words of each language, by primary language subtag. */
const locales: Readonly<Record<string, TokenLocale>> = {
  en: { dot: 'dot', slash: 'slash', backslash: 'backslash', colon: 'colon', tilde: 'tilde', port: 'port' },
  zh: { dot: '点', slash: '斜杠', backslash: '反斜杠', colon: '冒号', tilde: '波浪号', port: '端口' },
}

/** The token words of a language, or English for a language without them. */
export function tokenLocale(language: string): TokenLocale {
  return locales[language] ?? locales.en!
}
