import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

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

  const isConfigured = ref(false)

  function saveSettings() {
    isConfigured.value = true
  }

  return {
    ...state,
    isConfigured,
    saveSettings,
  }
})
