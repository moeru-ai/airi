import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Global vision request policies. Leader actions persist changes; snapshots never select a character model. */
export const useVisionSettingsStore = defineStore('vision-settings', () => {
  const useForChat = shallowRef(typeof localStorage === 'undefined' || localStorage.getItem('settings/vision/use-for-chat') !== 'false')
  const ollamaThinkingEnabled = shallowRef(typeof localStorage !== 'undefined' && localStorage.getItem('settings/vision/ollama-thinking-enabled') === 'true')

  async function setUseForChat(value: boolean) {
    useForChat.value = value
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('settings/vision/use-for-chat', String(value))
  }

  async function setOllamaThinkingEnabled(value: boolean) {
    ollamaThinkingEnabled.value = value
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('settings/vision/ollama-thinking-enabled', String(value))
  }

  return { useForChat, ollamaThinkingEnabled, setUseForChat, setOllamaThinkingEnabled }
}, {
  synced: {
    state: true,
    actions: ['setUseForChat', 'setOllamaThinkingEnabled'],
  },
})
