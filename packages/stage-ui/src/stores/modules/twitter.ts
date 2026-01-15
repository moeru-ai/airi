import { refManualReset, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export const useTwitterStore = defineStore('twitter', () => {
  const configurator = useConfiguratorByModsChannelServer()

  const enabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/twitter/enabled', false))
  const apiKey = refManualReset<string>(useLocalStorage<string>('settings/twitter/api-key', ''))
  const apiSecret = refManualReset<string>(useLocalStorage<string>('settings/twitter/api-secret', ''))
  const accessToken = refManualReset<string>(useLocalStorage<string>('settings/twitter/access-token', ''))
  const accessTokenSecret = refManualReset<string>(useLocalStorage<string>('settings/twitter/access-token-secret', ''))

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
    enabled.reset()
    apiKey.reset()
    apiSecret.reset()
    accessToken.reset()
    accessTokenSecret.reset()
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
