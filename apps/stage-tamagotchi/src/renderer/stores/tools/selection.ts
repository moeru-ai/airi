import type { ChatToolReference } from '@proj-airi/stage-ui/types/chat'

import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { artistryToolReferences, computerUseToolReferences } from './built-in'

/**
 * One runtime choice supplies computer-use tools to both typed and spoken turns across windows.
 * It stays global and returns to its default after restart. Conversation metadata does not store this UI choice.
 */
export const useToolSelectionStore = defineStore('tamagotchi-tool-selection', () => {
  const computerUseEnabled = shallowRef(true)
  const requestTools = computed<ChatToolReference[]>(() => computerUseEnabled.value
    ? [...artistryToolReferences, ...computerUseToolReferences]
    : artistryToolReferences)

  function setComputerUseEnabled(enabled: boolean) {
    computerUseEnabled.value = enabled
  }

  return { computerUseEnabled, requestTools, setComputerUseEnabled }
}, {
  synced: { state: true },
})
