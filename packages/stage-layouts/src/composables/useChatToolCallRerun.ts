import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { errorMessageFrom } from '@moeru/std'
import { resolveLlmTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/tool-resolver'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { executeToolCallRerun } from '@proj-airi/stage-ui/stores/tool-call-rerun'

export interface ChatToolCallRerunEvent {
  message: ChatHistoryItem
  index: number
  key: string | number
  toolCallId: string
  toolName: string
  args: string
}

export function useChatToolCallRerun() {
  const chatSession = useChatSessionStore()
  const cardStore = useAiriCardStore()

  async function rerunToolCall(payload: ChatToolCallRerunEvent) {
    const sessionId = chatSession.activeSessionId
    const currentMessages = chatSession.getSessionMessages(sessionId)

    try {
      const nextMessages = await executeToolCallRerun({
        messages: currentMessages,
        payload: {
          sessionId,
          messageId: payload.message.id,
          index: payload.index,
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          args: payload.args,
        },
        resolveTools: () => resolveLlmTools({
          // Keep the character card tool policy on web and mobile surfaces too.
          allowedToolNames: cardStore.activeCard?.extensions?.airi?.tools?.allowed,
        }),
      })
      chatSession.setSessionMessages(sessionId, nextMessages)
    }
    catch (error) {
      chatSession.setSessionMessages(sessionId, [
        ...currentMessages,
        {
          role: 'error',
          content: errorMessageFrom(error) ?? 'Failed to rerun tool call.',
        },
      ])
    }
  }

  return {
    rerunToolCall,
  }
}
