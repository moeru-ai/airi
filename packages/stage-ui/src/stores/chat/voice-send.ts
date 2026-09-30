import type { ChatAttachment } from '@proj-airi/core-agent'

import type { ChatToolReference } from '../../types/chat'

import { defineEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'
import { defineStore } from 'pinia'
import { onScopeDispose, shallowRef } from 'vue'

const voiceDraftDiscarded = defineEventa<{ sessionId?: string }>('eventa:chat:voice-draft:discarded')
const voiceDraftChannelName = 'airi-chat-voice-draft-discard'

/** A voice draft stays with its chat session until its user turn is stored. */
export interface PendingVoiceSend {
  sessionId: string
  audio: Extract<ChatAttachment, { type: 'audio' }>
  replyToMessageId?: string
  tools?: ChatToolReference[]
  existingMessageIds: string[]
  status: 'sending' | 'failed'
}

export const useVoiceSendStore = defineStore('voice-send', () => {
  const pendingSends = shallowRef<Record<string, PendingVoiceSend>>({})
  const channel = createBroadcastChannelContext(new BroadcastChannel(voiceDraftChannelName), { closeOnDispose: true })

  function clearSession(sessionId: string) {
    const next = { ...pendingSends.value }
    delete next[sessionId]
    pendingSends.value = next
  }

  const stopDiscardEvents = channel.context.on(voiceDraftDiscarded, ({ body }) => {
    if (!body)
      return
    if (body.sessionId)
      clearSession(body.sessionId)
    else
      pendingSends.value = {}
  })

  function discardSession(sessionId: string) {
    clearSession(sessionId)
    void channel.context.emit(voiceDraftDiscarded, { sessionId })
      .catch(error => console.warn('[Voice Send] Failed to discard remote voice draft:', error))
  }

  function discardAll() {
    pendingSends.value = {}
    void channel.context.emit(voiceDraftDiscarded, {})
      .catch(error => console.warn('[Voice Send] Failed to discard remote voice drafts:', error))
  }

  onScopeDispose(() => {
    stopDiscardEvents()
    channel.dispose()
  })

  return { pendingSends, discardSession, discardAll }
})
