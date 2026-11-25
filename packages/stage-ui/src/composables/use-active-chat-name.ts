import type { ComputedRef } from 'vue'

import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useChatSessionStore } from '../stores/chat/session-store'
import { chatNameOf, chatSummaryOf } from '../stores/chat/session-summary'

/**
 * The name of the chat that the window shows, the same name that its row in the chat list shows: its title, else its
 * first message. A chat with neither has no name yet, and the value is `undefined`. The caller shows a fallback then,
 * for example in a lighter color.
 */
export function useActiveChatName(): ComputedRef<string | undefined> {
  const { activeSessionId, sessionMetas, sessionMessages } = storeToRefs(useChatSessionStore())
  return computed(() => {
    const meta = sessionMetas.value[activeSessionId.value]
    if (!meta)
      return undefined
    return chatNameOf(meta, chatSummaryOf(meta, sessionMessages.value[activeSessionId.value]))
  })
}
