import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { settingsBroadcaster } from '../../services/settings-broadcaster'

export const useMinecraftStore = defineStore('minecraft', () => {
  const enabled = useLocalStorage('settings/minecraft/enabled', false)
  const serverAddress = useLocalStorage('settings/minecraft/server-address', '')
  const serverPort = useLocalStorage('settings/minecraft/server-port', 25565) // stored as a number
  const username = useLocalStorage('settings/minecraft/username', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    settingsBroadcaster.sendConfiguration('minecraft', {
      enabled: enabled.value,
      serverAddress: serverAddress.value,
      serverPort: serverPort.value,
      username: username.value,
    })
  }

  const configured = computed(() => {
    return !!(serverAddress.value.trim() && username.value.trim())
  })

  return {
    enabled,
    serverAddress,
    serverPort, // Numeric values, used directly
    username,
    configured,
    saveSettings,
  }
})
