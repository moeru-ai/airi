import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useProvidersStore = defineStore('providers', () => {
  const providers = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {})

  return {
    providers,
  }
})
