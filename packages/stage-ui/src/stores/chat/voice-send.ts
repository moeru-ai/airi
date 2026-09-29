import type { ChatAttachment } from '@proj-airi/core-agent'

import type { ChatToolReference } from '../../types/chat'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** A voice draft stays with its chat session until its user turn is stored. */
export interface PendingVoiceSend {
  sessionId: string
  audio: Extract<ChatAttachment, { type: 'audio' }>
  replyToMessageId?: string
  tools?: ChatToolReference[]
  status: 'sending' | 'failed'
}

export const useVoiceSendStore = defineStore('voice-send', () => {
  const pendingSends = shallowRef<Record<string, PendingVoiceSend>>({})

  function discardSession(sessionId: string) {
    const next = { ...pendingSends.value }
    delete next[sessionId]
    pendingSends.value = next
  }

  return { pendingSends, discardSession }
})
