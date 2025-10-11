import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useDiscordStore } from './discord'
import { useTelegramStore } from './telegram'

export const useMessagingStore = defineStore('messaging', () => {
  const discordStore = useDiscordStore()
  const telegramStore = useTelegramStore()

  const { configured: discordConfigured } = storeToRefs(discordStore)
  const { configured: telegramConfigured } = storeToRefs(telegramStore)

  const configured = computed(() => {
    return discordConfigured.value || telegramConfigured.value
  })

  return {
    discordConfigured,
    telegramConfigured,
    configured,
  }
})
