import messages from '@proj-airi/i18n/locales'

import { localeRemap } from '@proj-airi/i18n'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { onMounted } from 'vue'

export const useSettingsGeneral = defineStore('settings-general', () => {
  const language = useLocalStorageManualReset<string>('settings/language', '')

  const disableTransitions = useLocalStorageManualReset<boolean>('settings/disable-transitions', true)
  const usePageSpecificTransitions = useLocalStorageManualReset<boolean>('settings/use-page-specific-transitions', true)

  const websocketSecureEnabled = useLocalStorageManualReset<boolean>('settings/websocket/secure-enabled', false)

  function getLanguage() {
    let language = localStorage.getItem('settings/language')

    if (!language) {
      // Fallback to browser language
      language = navigator.language || 'en'
    }

    const languages = Object.keys(messages!)
    if (localeRemap[language || 'en'] != null) {
      language = localeRemap[language || 'en']
    }
    if (language && languages.includes(language))
      return language

    return 'en'
  }

  function resetState() {
    language.reset()
    disableTransitions.reset()
    usePageSpecificTransitions.reset()
    websocketSecureEnabled.reset()
  }

  onMounted(() => language.value = getLanguage())

  return {
    language,
    disableTransitions,
    usePageSpecificTransitions,
    websocketSecureEnabled,
    getLanguage,
    resetState,
  }
})
