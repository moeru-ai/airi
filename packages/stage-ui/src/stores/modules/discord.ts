import { refManualReset, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export const useDiscordStore = defineStore('discord', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const enabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/discord/enabled', false))
  const token = refManualReset<string>(useLocalStorage<string>('settings/discord/token', ''))

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
