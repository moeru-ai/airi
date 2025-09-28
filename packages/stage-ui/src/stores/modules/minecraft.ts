import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useMinecraftStore = defineStore('minecraft', () => {
  const enabled = useLocalStorage('settings/minecraft/enabled', false)
  const serverAddress = useLocalStorage('settings/minecraft/server-address', '')
  const serverPort = useLocalStorage('settings/minecraft/server-port', '25565') // stored as a string
  const username = useLocalStorage('settings/minecraft/username', '')

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
    get: () => Number.parseInt(serverPort.value) || 25565,
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
