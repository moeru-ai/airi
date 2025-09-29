import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { settingsBroadcaster } from '../../services/settings-broadcaster'

export const useFactorioStore = defineStore('factorio', () => {
  const enabled = useLocalStorage('settings/factorio/enabled', false)
  const serverAddress = useLocalStorage('settings/factorio/server-address', '')
  const serverPort = useLocalStorage<number | null>('settings/factorio/server-port', 34197) // stored as a number or null
  const username = useLocalStorage('settings/factorio/username', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    settingsBroadcaster.sendConfiguration('factorio', {
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
