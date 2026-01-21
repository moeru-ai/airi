import { defineStore } from 'pinia'

import { useChatOrchestratorStore } from '../chat'
import { useChatContextStore } from './context-store'
import { useChatSessionStore } from './session-store'
import { useChatStreamStore } from './stream-store'

export const useChatMaintenanceStore = defineStore('chat-maintenance', () => {
  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const chatOrchestrator = useChatOrchestratorStore()

  function cleanupMessages(sessionId = chatSession.activeSessionId) {
    chatSession.cleanupMessages(sessionId)
    chatContext.resetContexts()
    chatOrchestrator.cancelPendingSends(sessionId)
    chatStream.resetStream()
  }

  return {
    cleanupMessages,
  }
})
