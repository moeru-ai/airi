import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useSettings = defineStore('settings', () => {
  const openAiApiKey = useLocalStorage('settings/credentials/openai-api-key', '')
  const openAiApiBaseURL = useLocalStorage('settings/credentials/openai-api-base-url', '')
  const elevenLabsApiKey = useLocalStorage('settings/credentials/elevenlabs-api-key', '')
  const stageView = useLocalStorage('settings/stage/view/model-renderer', '2d')

  return {
    openAiApiKey,
    openAiApiBaseURL,
    elevenLabsApiKey,
    stageView,
  }
})
