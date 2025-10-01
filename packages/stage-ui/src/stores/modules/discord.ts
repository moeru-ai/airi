import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorForAiriSdk } from '../configurator'

export const useDiscordStore = defineStore('discord', () => {
  const configurator = useConfiguratorForAiriSdk()
  const enabled = useLocalStorage('settings/discord/enabled', false)
  const token = useLocalStorage('settings/discord/token', '')

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

  return {
    enabled,
    token,
    configured,
    saveSettings,
  }
})
