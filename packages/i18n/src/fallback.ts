/** The locale that has every key. Every other locale falls back to it. */
const sourceLocale = 'en'

/**
 * Creates the vue-i18n options for the fallback to English.
 *
 * A locale leaves out a key when its translation equals the English text, so its fallback to English is the design
 * and stays quiet. Only a key that English lacks goes to `warn`, because then no locale has it. vue-i18n gives no
 * warning of its own while `missing` is set.
 */
export function createFallbackOptions(warn: (message: string) => void) {
  return {
    fallbackLocale: sourceLocale,
    fallbackWarn: false,
    missing: (locale: string, key: string): void => {
      if (locale === sourceLocale)
        warn(`[i18n] English has no message for '${key}'. Add it to the English locale files.`)
    },
  }
}
