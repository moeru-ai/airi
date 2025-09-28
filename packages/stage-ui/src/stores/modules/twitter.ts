import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useTwitterStore = defineStore('twitter', () => {
  const enabled = useLocalStorage('settings/twitter/enabled', false)
  const apiKey = useLocalStorage('settings/twitter/api-key', '')
  const apiSecret = useLocalStorage('settings/twitter/api-secret', '')
  const accessToken = useLocalStorage('settings/twitter/access-token', '')
  const accessTokenSecret = useLocalStorage('settings/twitter/access-token-secret', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
  }

  function loadSettings() {
    // Data is automatically loaded from localStorage via useLocalStorage
  }

  const configured = computed(() => {
    return !!(apiKey.value.trim() && apiSecret.value.trim() && accessToken.value.trim() && accessTokenSecret.value.trim())
  })

  return {
    enabled,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret,
    configured,
    saveSettings,
    loadSettings,
  }
})
