import type { ChatToolReference } from '@proj-airi/stage-ui/types/chat'

import { defineStore } from 'pinia'
import { computed } from 'vue'

import { artistryToolReferences } from './built-in'

/**
 * The tools that the user grants to new chat turns.
 *
 * The chat window composer owns the control. Turns from other sources read the same choice: the main window sends
 * spoken turns with {@link requestTools}, so a wake word reaches the same tools as typed text.
 */
export const useToolSelectionStore = defineStore('tamagotchi-tool-selection', () => {
  /** Tool references of a new turn. */
  const requestTools = computed<ChatToolReference[]>(() => artistryToolReferences)

  return { requestTools }
})
