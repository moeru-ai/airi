import { defineStore } from 'pinia'
import { computed } from 'vue'

import { createResettableLocalStorage } from '../../utils/resettable'
import { useConfiguratorByModsChannelServer } from '../configurator'

export const useTwitterStore = defineStore('twitter', () => {
  const configurator = useConfiguratorByModsChannelServer()

  const [enabled, resetEnabled] = createResettableLocalStorage('settings/twitter/enabled', false)
  const [apiKey, resetApiKey] = createResettableLocalStorage('settings/twitter/api-key', '')
  const [apiSecret, resetApiSecret] = createResettableLocalStorage('settings/twitter/api-secret', '')
  const [accessToken, resetAccessToken] = createResettableLocalStorage('settings/twitter/access-token', '')
  const [accessTokenSecret, resetAccessTokenSecret] = createResettableLocalStorage('settings/twitter/access-token-secret', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    configurator.updateFor('twitter', {
      enabled: enabled.value,
      apiKey: apiKey.value,
      apiSecret: apiSecret.value,
      accessToken: accessToken.value,
      accessTokenSecret: accessTokenSecret.value,
    })
  }

  const configured = computed(() => {
    return !!(apiKey.value.trim() && apiSecret.value.trim() && accessToken.value.trim() && accessTokenSecret.value.trim())
  })

  function resetState() {
    resetEnabled()
    resetApiKey()
    resetApiSecret()
    resetAccessToken()
    resetAccessTokenSecret()
    saveSettings()
  }

  return {
    enabled,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret,
    configured,
    saveSettings,
    resetState,
  }
})
