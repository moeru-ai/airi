import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useProvidersStore = defineStore('providers', () => {
  const providers = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {})

  const coreControllerProvider = useLocalStorage<string>('settings/credentials/coreControllerProvider', 'openai')
  const audioSynthesisProvider = useLocalStorage<string>('settings/credentials/audioSynthesisProvider', 'elevenlabs')

  const configuredForOpenRouter = computed<boolean>(() => {
    return !!providers.value['openrouter-ai'].baseUrl && !!providers.value['openrouter-ai'].apiKey
  })

  function configuredFor(provider: string): boolean {
    switch (provider) {
      case 'openrouter-ai':
        return configuredForOpenRouter.value
      default:
        return false
    }
  }

  return {
    providers,
    coreControllerProvider,
    audioSynthesisProvider,
    configuredForOpenRouter,
    configuredFor,
  }
})
