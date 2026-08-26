import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export const useTwitterStore = defineStore('twitter', () => {
  const configurator = useConfiguratorByModsChannelServer()

  const enabled = useLocalStorageManualReset<boolean>('settings/twitter/enabled', false)
  const apiKey = useLocalStorageManualReset<string>('settings/twitter/api-key', '')
  const apiSecret = useLocalStorageManualReset<string>('settings/twitter/api-secret', '')
  const accessToken = useLocalStorageManualReset<string>('settings/twitter/access-token', '')
  const accessTokenSecret = useLocalStorageManualReset<string>('settings/twitter/access-token-secret', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    configurator.updateFor('twitter', {
      accessToken: accessToken.value,
      accessTokenSecret: accessTokenSecret.value,
      apiKey: apiKey.value,
      apiSecret: apiSecret.value,
      enabled: enabled.value,
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
    accessToken,
    accessTokenSecret,
    apiKey,
    apiSecret,
    configured,
    enabled,
    resetState,
    saveSettings,
  }
})
