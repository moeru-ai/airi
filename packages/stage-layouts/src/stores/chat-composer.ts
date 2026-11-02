import type { ChatImageAttachment } from '@proj-airi/stage-ui/components/scenarios/chat'

import { useChatComposer } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { defineStore, storeToRefs } from 'pinia'
import { markRaw } from 'vue'

/**
 * Owns the one composer that the desktop and mobile stage layouts share.
 *
 * A window resize or a device fold can replace one layout with the other. The draft, attachments,
 * and reply target must stay when this occurs, so they cannot belong to the layout components.
 */
export const useStageChatComposerStore = defineStore('stage-chat-composer', () => {
  const chatOrchestrator = useChatStore()
  const { activeSessionId } = storeToRefs(useChatSessionStore())

  return {
    // A reactive store proxy unwraps refs, but consumers destructure these refs. The controller must stay raw.
    composer: markRaw(useChatComposer<ChatImageAttachment>({
      activeSessionId,
      send: submission => chatOrchestrator.send({
        sessionId: submission.sessionId,
        text: submission.text,
        attachments: submission.attachments.map(({ type, data, mimeType }) => ({ type, data, mimeType })),
        replyToMessageId: submission.replyToMessageId,
      }),
    })),
  }
})
