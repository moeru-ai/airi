import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useFactorioStore = defineStore('factorio', () => {
  const enabled = useLocalStorage('settings/factorio/enabled', false)
  const serverAddress = useLocalStorage('settings/factorio/server-address', '')
  const serverPort = useLocalStorage('settings/factorio/server-port', '34197') // stored as a string
  const username = useLocalStorage('settings/factorio/username', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
  }

  function loadSettings() {
    // Data is automatically loaded from localStorage via useLocalStorage
  }

  const configured = computed(() => {
    return !!(serverAddress.value.trim() && username.value.trim())
  })

  // Calculated attributes are used to provide numeric values when needed
  const numericPort = computed({
    get: () => Number.parseInt(serverPort.value) || 34197,
    set: (value) => {
      serverPort.value = value.toString()
    },
  })

  return {
    enabled,
    serverAddress,
    serverPort, // String values, used for form input
    numericPort, // Numeric values, used for logical processing
    username,
    configured,
    saveSettings,
    loadSettings,
  }
})
