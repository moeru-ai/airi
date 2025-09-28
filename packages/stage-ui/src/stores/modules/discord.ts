import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useDiscordStore = defineStore('discord', () => {
  const enabled = useLocalStorage('settings/discord/enabled', false)
  const token = useLocalStorage('settings/discord/token', '')

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
  }

  function loadSettings() {
    // Data is automatically loaded from localStorage via useLocalStorage
  }

  const configured = computed(() => {
    return !!token.value.trim()
  })

  return {
    enabled,
    token,
    configured,
    saveSettings,
    loadSettings,
  }
})
