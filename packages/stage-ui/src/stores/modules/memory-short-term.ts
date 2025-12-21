import { defineStore } from 'pinia'
import { computed } from 'vue'

import { createResettableLocalStorage } from '../../utils/resettable'

export const useMemoryShortTermStore = defineStore('memory-short-term', () => {
  // State
  const [enabled, resetEnabled] = createResettableLocalStorage('settings/memory/short-term/enabled', false)
  const [maxMessages, resetMaxMessages] = createResettableLocalStorage('settings/memory/short-term/max-messages', 20)

  const configured = computed(() => {
    return enabled.value
  })

  function resetState() {
    resetEnabled()
    resetMaxMessages()
  }

  return {
    // State
    enabled,
    maxMessages,
    configured,

    // Actions
    resetState,
  }
})
