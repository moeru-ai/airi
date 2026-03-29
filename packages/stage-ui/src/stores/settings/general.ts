import messages from '@proj-airi/i18n/locales'

import { resolveSupportedLocale } from '@proj-airi/i18n'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { onMounted } from 'vue'

export const useSettingsGeneral = defineStore('settings-general', () => {
  const language = useLocalStorageManualReset<string>('settings/language', '')

  const disableTransitions = useLocalStorageManualReset<boolean>('settings/disable-transitions', true)
  const usePageSpecificTransitions = useLocalStorageManualReset<boolean>('settings/use-page-specific-transitions', true)

  const websocketSecureEnabled = useLocalStorageManualReset<boolean>('settings/websocket/secure-enabled', false)

  // NOTICE: 补回翻译字幕的核心开关
  const translationSubtitleEnabled = useLocalStorageManualReset<boolean>('settings/translation-subtitle-enabled', false)
  const translationLanguage = useLocalStorageManualReset<string>('settings/translation-language', 'zh-CN')

  const captionSpeakerColor = useLocalStorageManualReset<string>('settings/caption-speaker-color', '#ffffff')
  const captionAssistantColor = useLocalStorageManualReset<string>('settings/caption-assistant-color', '#eff6ff')
  const captionTranslationColor = useLocalStorageManualReset<string>('settings/caption-translation-color', '#dbeafe')

  const captionSpeakerStrokeColor = useLocalStorageManualReset<string>('settings/caption-speaker-stroke-color', '#171717')
  const captionAssistantStrokeColor = useLocalStorageManualReset<string>('settings/caption-assistant-stroke-color', '#93c5fd')
  const captionTranslationStrokeColor = useLocalStorageManualReset<string>('settings/caption-translation-stroke-color', '#1e40af')

  function getLanguage() {
    let language = localStorage.getItem('settings/language')

    if (!language) {
      // Fallback to browser language
      language = navigator.language || 'en'
    }

    return resolveSupportedLocale(language, Object.keys(messages!))
  }

  function resetState() {
    language.reset()
    disableTransitions.reset()
    usePageSpecificTransitions.reset()
    websocketSecureEnabled.reset()
    translationSubtitleEnabled.reset()
    translationLanguage.reset()
    captionSpeakerColor.reset()
    captionAssistantColor.reset()
    captionTranslationColor.reset()
    captionSpeakerStrokeColor.reset()
    captionAssistantStrokeColor.reset()
    captionTranslationStrokeColor.reset()
  }

  onMounted(() => language.value = getLanguage())

  return {
    language,
    disableTransitions,
    usePageSpecificTransitions,
    websocketSecureEnabled,
    translationSubtitleEnabled,
    translationLanguage,
    captionSpeakerColor,
    captionAssistantColor,
    captionTranslationColor,
    captionSpeakerStrokeColor,
    captionAssistantStrokeColor,
    captionTranslationStrokeColor,
    getLanguage,
    resetState,
  }
})
