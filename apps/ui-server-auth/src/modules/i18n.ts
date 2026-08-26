import messages from '@proj-airi/i18n/locales'

import { resolveSupportedLocale } from '@proj-airi/i18n'
import { createI18n } from 'vue-i18n'

function getLocale() {
  let language = localStorage.getItem('settings/language')

  if (!language) {
    // Fallback to browser language
    language = navigator.language || 'en'
  }

  return resolveSupportedLocale(language, Object.keys(messages!))
}

export const i18n = createI18n({
  fallbackLocale: 'en',
  legacy: false,
  locale: getLocale(),
  messages,
})
