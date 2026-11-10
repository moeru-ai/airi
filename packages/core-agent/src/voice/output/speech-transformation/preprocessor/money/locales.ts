import { spellNumber } from '@proj-airi/speech-transformer-math'

/** The words of money in one language. */
export interface MoneyLocale {
  /** Reads an amount of US dollars from its digits, for example `1200` or `19.99`. */
  dollars: (digits: string) => string
}

/**
 * The money words of each language, by primary language subtag.
 * Chinese keeps the digits, because a Chinese voice reads them. The other languages spell them, so the voice does not
 * read them in another language.
 */
const locales: Readonly<Record<string, MoneyLocale>> = {
  en: { dollars: digits => `${spellNumber(digits, 'en')} ${digits === '1' ? 'dollar' : 'dollars'}` },
  ja: { dollars: digits => `${spellNumber(digits, 'ja')}ドル` },
  ko: { dollars: digits => `${spellNumber(digits, 'ko')} 달러` },
  zh: { dollars: digits => `${digits}美元` },
}

/** The money words of a language, or English for a language without them. */
export function moneyLocale(language: string): MoneyLocale {
  return locales[language] ?? locales.en!
}
