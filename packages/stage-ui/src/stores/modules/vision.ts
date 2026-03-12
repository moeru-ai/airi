import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'

export interface VisionModuleState {
  enabled: boolean
  autoCapture: {
    enabled: boolean
    interval: number
  }
  model: {
    provider: 'openai' | 'ollama'
    modelName: string
    apiKey: string
    baseUrl: string
  }
  cooldown: number
}

export const useVisionModuleStore = defineStore('vision-module', () => {
  const state = reactive<VisionModuleState>({
    enabled: false,
    autoCapture: {
      enabled: false,
      interval: 30000,
    },
    model: {
      provider: 'openai',
      modelName: 'gpt-4o',
      apiKey: '',
      baseUrl: '',
    },
    cooldown: 5000,
  })

  const isConfigured = computed(() => {
    if (!state.enabled)
      return true
    if (!state.model.modelName)
      return false
    if (!state.model.apiKey && state.model.provider === 'openai')
      return false
    return true
  })

  function saveSettings() {
    // Settings saved, isConfigured will be recomputed
  }

  return {
    ...state,
    isConfigured,
    saveSettings,
  }
})
