import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { i18n } from '~/modules/i18n'

export const useSettings = defineStore('settings', () => {
  const openAiApiKey = useLocalStorage('settings/credentials/openai-api-key', '')
  const openAiApiBaseURL = useLocalStorage('settings/credentials/openai-api-base-url', '')
  const elevenLabsApiKey = useLocalStorage('settings/credentials/elevenlabs-api-key', '')
  const language = useLocalStorage('settings/language', 'en')
  const stageView = useLocalStorage('settings/stage/view/model-renderer', '2d')

  watch(language, value => i18n.global.locale.value = value)

  return {
    openAiApiKey,
    openAiApiBaseURL,
    elevenLabsApiKey,
    language,
    stageView,
  }
})
