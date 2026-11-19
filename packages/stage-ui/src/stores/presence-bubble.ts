import type { PresenceBubbleState } from '@proj-airi/stage-shared'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * Developer control over what the stage draws above the character.
 *
 * Holds only the override. The stage merges it with the real signals, so this
 * store does not pull the chat runtime into every window that shows the control.
 *
 * Replicated rather than persisted. The control lives in the settings window and
 * the bubble is drawn in the stage window, so the value has to cross windows;
 * surviving a restart would only leave a test switch on by surprise.
 */
export const useSettingsPresenceBubble = defineStore('settings-presence-bubble', () => {
  const presenceBubbleOverrideEnabled = ref(false)
  const presenceBubbleOverrideThinking = ref(false)
  const presenceBubbleOverrideUnread = ref(0)

  /**
   * What the developer control is forcing, or `undefined` when it is off and the
   * stage should read the real signals instead.
   */
  const presenceOverride = computed<PresenceBubbleState | undefined>(() => {
    if (!presenceBubbleOverrideEnabled.value)
      return undefined

    return {
      thinking: presenceBubbleOverrideThinking.value,
      unreadCount: presenceBubbleOverrideUnread.value,
    }
  })

  function resetState() {
    presenceBubbleOverrideEnabled.value = false
    presenceBubbleOverrideThinking.value = false
    presenceBubbleOverrideUnread.value = 0
  }

  return {
    presenceBubbleOverrideEnabled,
    presenceBubbleOverrideThinking,
    presenceBubbleOverrideUnread,
    presenceOverride,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})
