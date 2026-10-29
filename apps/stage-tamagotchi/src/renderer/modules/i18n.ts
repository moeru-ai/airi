import messages from '@proj-airi/i18n/locales'

import { createFallbackOptions, resolveSupportedLocale } from '@proj-airi/i18n'
import { createI18n } from 'vue-i18n'

function getLocale() {
  let language = localStorage.getItem('settings/language')

  if (!language) {
    // Fallback to browser language
    language = navigator.language || 'en'
  }

  return resolveSupportedLocale(language, Object.keys(messages!))
}

const locale = getLocale()

// Chromium picks the fallback font for CJK text from the document language.
// It must follow the UI locale, so the OS language does not choose the font.
// `useLanguage` updates it when the language changes.
document.documentElement.lang = locale

export const i18n = createI18n({
  legacy: false,
  locale,
  messages,
  ...createFallbackOptions(console.warn),
})
