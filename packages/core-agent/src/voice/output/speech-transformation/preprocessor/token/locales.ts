/** The words that read the symbols of a web address in one language. */
export interface AddressLocale {
  dot: string
  slash: string
  port: string
}

/** The address words of each language, by primary language subtag. */
const locales: Readonly<Record<string, AddressLocale>> = {
  en: { dot: 'dot', slash: 'slash', port: 'port' },
  zh: { dot: '点', slash: '斜杠', port: '端口' },
}

/** The address words of a language, or English for a language without them. */
export function addressLocale(language: string): AddressLocale {
  return locales[language] ?? locales.en!
}
