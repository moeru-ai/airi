import messages from '@proj-airi/i18n/locales'

import { resolveSupportedLocale } from '@proj-airi/i18n'
import { createI18n } from 'vue-i18n'

function getLocale() {
  let language = 'en'
  // NOTICE: histoire doesn't have localStorage during collection, directly accessing it causes error.
  if (
    'localStorage' in globalThis &&
    localStorage != null &&
    'getItem' in localStorage &&
    typeof localStorage.getItem === 'function'
  ) {
    language = localStorage.getItem('settings/language') || 'en'
  }

  // JS-W1028: `language` is always at least `'en'` (line 7 default + `|| 'en'` above),
  // so this branch was dead code. Keep the fallback but make it reachable by checking
  // for empty string explicitly.
  if (language === '') {
    // Fallback to browser language
    language = navigator.language || 'en'
  }

  return resolveSupportedLocale(language, Object.keys(messages!))
}

export const i18n = createI18n({
  legacy: false,
  locale: getLocale(),
  fallbackLocale: 'en',
  messages,
})
