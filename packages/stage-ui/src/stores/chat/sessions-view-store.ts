import type { ChatSessionsPlace } from '../../types/chat-session'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/**
 * The view of the conversation list: the place and the character of the filter that the user chose.
 *
 * The list closes with its drawer or popover. This store keeps the view while the window lives, so the list opens again
 * where the user left it. The view stays in memory and is not saved.
 */
export const useChatSessionsViewStore = defineStore('chat-sessions-view', () => {
  const place = shallowRef<ChatSessionsPlace>({ kind: 'all' })
  /** `undefined` shows every character. */
  const characterId = shallowRef<string>()

  return {
    place,
    characterId,
  }
})
