import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useProvidersStore = defineStore('providers', () => {
  const providers = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {})

  const coreControllerProvider = useLocalStorage<string>('settings/credentials/coreControllerProvider', 'openai')
  const audioSynthesisProvider = useLocalStorage<string>('settings/credentials/audioSynthesisProvider', 'elevenlabs')

  return {
    providers,
    coreControllerProvider,
    audioSynthesisProvider,
  }
})
