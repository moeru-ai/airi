import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { settingsBroadcaster } from '../../services/settings-broadcaster'

export const useTwitterStore = defineStore('twitter', () => {
  const enabled = useLocalStorage('settings/twitter/enabled', false)
  const apiKey = useLocalStorage('settings/twitter/api-key', '')
  const apiSecret = useLocalStorage('settings/twitter/api-secret', '')
  const accessToken = useLocalStorage('settings/twitter/access-token', '')
  const accessTokenSecret = useLocalStorage('settings/twitter/access-token-secret', '')

  // Watch for changes to the credentials and broadcast to backend when they change
  watch([apiKey, apiSecret, accessToken, accessTokenSecret], ([newApiKey, newApiSecret, newAccessToken, newAccessTokenSecret]) => {
    if (newApiKey && newApiSecret && newAccessToken && newAccessTokenSecret) {
      settingsBroadcaster.sendConfiguration('twitter', {
        apiKey: newApiKey,
        apiSecret: newApiSecret,
        accessToken: newAccessToken,
        accessTokenSecret: newAccessTokenSecret,
      })
    }
  })

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    settingsBroadcaster.sendConfiguration('twitter', {
      enabled: enabled.value,
      apiKey: apiKey.value,
      apiSecret: apiSecret.value,
      accessToken: accessToken.value,
      accessTokenSecret: accessTokenSecret.value,
    })
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
