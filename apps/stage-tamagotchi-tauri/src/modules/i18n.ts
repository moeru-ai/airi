import messages from '@intlify/unplugin-vue-i18n/messages'
import { createI18n } from 'vue-i18n'

export const i18n = createI18n({
  legacy: false,
  locale: getLocale(),
  fallbackLocale: 'en',
  messages,
})

function getLocale() {
  const language = localStorage.getItem('settings/language')
  const languages = Object.keys(messages!)

  if (language && languages.includes(language))
    return language

  // let locale = navigator.language

  // if (locale === 'zh')
  //   locale = 'zh-CN'

  return 'en'
}
