import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useFactorioStore = defineStore('factorio', () => {
  const enabled = useLocalStorage('settings/factorio/enabled', false)
  const serverAddress = useLocalStorage('settings/factorio/server-address', '')
  const serverPort = useLocalStorage('settings/factorio/server-port', 34197) // stored as a number
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

  return {
    enabled,
    serverAddress,
    serverPort, // Numeric values, used directly
    username,
    configured,
    saveSettings,
    loadSettings,
  }
})
