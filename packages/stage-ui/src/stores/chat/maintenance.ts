import { defineStore } from 'pinia'

import { useChatOrchestratorStore } from '../chat'
import { useMemoryLongTermStore } from '../modules/memory-long-term'
import { useChatContextStore } from './context-store'
import { useChatSessionStore } from './session-store'
import { useChatStreamStore } from './stream-store'

export const useChatMaintenanceStore = defineStore('chat-maintenance', () => {
  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const memoryLongTerm = useMemoryLongTermStore()

  function cleanupMessages(sessionId = chatSession.activeSessionId) {
    void memoryLongTerm.captureSessionSummary([...chatSession.getSessionMessages(sessionId)], sessionId).catch((error) => {
      console.warn('[chat-maintenance] failed to persist session summary:', error)
    })
    chatSession.cleanupMessages(sessionId)
    chatContext.resetContexts()
    chatOrchestrator.cancelPendingSends(sessionId)
    chatStream.resetStream()
  }

  return {
    cleanupMessages,
  }
})
