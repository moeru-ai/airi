import messages from '@proj-airi/i18n/locales'

import { createI18n } from 'vue-i18n'

const languageRemap: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'zh-HK': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'zh-Hant': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
  'en': 'en',
  'es-ES': 'es',
  'es-MX': 'es',
  'es-AR': 'es',
  'es': 'es',
  'ru': 'ru',
  'ru-RU': 'ru',
}

function getLocale() {
  let language = localStorage.getItem('settings/language')

  if (!language) {
    // Fallback to browser language
    language = navigator.language || 'en'
  }

  const languages = Object.keys(messages!)
  if (languageRemap[language || 'en'] != null) {
    language = languageRemap[language || 'en']
  }
  if (language && languages.includes(language))
    return language

  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: getLocale(),
  fallbackLocale: 'en',
  messages,
})
