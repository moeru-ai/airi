import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export const useTelegramStore = defineStore('telegram', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const enabled = useLocalStorage('settings/telegram/enabled', false)
  const token = useLocalStorage('settings/telegram/token', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    configurator.updateFor('telegram', {
      token: token.value,
      enabled: enabled.value,
    })
  }

  const configured = computed(() => {
    return !!token.value.trim()
  })

  return {
    enabled,
    token,
    configured,
    saveSettings,
  }
})
