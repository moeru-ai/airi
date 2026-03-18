import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useChatOrchestratorStore } from '../../chat'
import { useChatContextStore } from '../../chat/context-store'
import { useChatSessionStore } from '../../chat/session-store'
import { useMemoryLongTermStore } from '../../modules/memory-long-term'

export const useMemoryBridgeStore = defineStore('mods:api:memory-bridge', () => {
  const memoryStore = useMemoryLongTermStore()
  const chatContext = useChatContextStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const chatSession = useChatSessionStore()
  const disposeFns = ref<Array<() => void>>([])

  async function initialize() {
    if (disposeFns.value.length > 0)
      return

    await memoryStore.initialize()

    disposeFns.value.push(
      chatOrchestrator.onBeforeMessageComposed(async (message) => {
        try {
          const memories = await memoryStore.searchMemories(message, { automatic: true })
          const context = memoryStore.createRecallContext(memories)
          if (context) {
            chatContext.ingestContextMessage(context)
          }
        }
        catch (error) {
          console.warn('[memory-bridge] failed to recall memories:', error)
        }
      }),
      chatOrchestrator.onChatTurnComplete(async (_chat, context) => {
        const sessionId = context.input?.data.overrides?.sessionId ?? chatSession.activeSessionId
        const messages = [...chatSession.getSessionMessages(sessionId)]

        void memoryStore.captureSessionMessages(messages, sessionId).catch((error) => {
          console.warn('[memory-bridge] failed to capture memories:', error)
        })
      }),
    )
  }

  function dispose() {
    for (const disposeFn of disposeFns.value) {
      disposeFn()
    }

    disposeFns.value = []
  }

  return {
    initialize,
    dispose,
  }
})
