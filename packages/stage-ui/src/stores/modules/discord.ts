import { defineStore } from 'pinia'
import { computed } from 'vue'

import { createResettableLocalStorage } from '../../utils/resettable'
import { useConfiguratorByModsChannelServer } from '../configurator'

export const useDiscordStore = defineStore('discord', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const [enabled, resetEnabled] = createResettableLocalStorage('settings/discord/enabled', false)
  const [token, resetToken] = createResettableLocalStorage('settings/discord/token', '')

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
    resetEnabled()
    resetToken()
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
