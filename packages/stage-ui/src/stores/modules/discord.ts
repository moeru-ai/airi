import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export const useDiscordStore = defineStore('discord', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const enabled = useLocalStorageManualReset<boolean>('settings/discord/enabled', false)
  const token = useLocalStorageManualReset<string>('settings/discord/token', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    configurator.updateFor('discord', {
      token: token.value,
      enabled: enabled.value,
    })
  }

  const configured = computed(() => {
    return !!token.value.trim()
  })

  function resetState() {
    enabled.reset()
    token.reset()
    saveSettings()
  }

  return {
    enabled,
    token,
    configured,
    saveSettings,
    resetState,
  }
})
