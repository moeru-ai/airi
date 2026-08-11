import { defineStore } from 'pinia'

import { useChatStore } from '../chat'
import { useChatSessionStore } from './session-store'

export const useChatMaintenanceStore = defineStore('chat-maintenance', () => {
  const chatSession = useChatSessionStore()
  const chatStore = useChatStore()

  function cleanupMessages(sessionId = chatSession.activeSessionId) {
    return chatStore.cleanup(sessionId)
  }

  return {
    cleanupMessages,
  }
})
