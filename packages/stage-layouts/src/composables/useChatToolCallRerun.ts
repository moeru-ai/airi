import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { errorMessageFrom } from '@moeru/std'
import { resolveLlmTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/tool-resolver'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { executeToolCallRerun } from '@proj-airi/stage-ui/stores/tool-call-rerun'

export interface ChatToolCallRerunEvent {
  args: string
  index: number
  key: number | string
  message: ChatHistoryItem
  toolCallId: string
  toolName: string
}

export function useChatToolCallRerun() {
  const chatSession = useChatSessionStore()

  async function rerunToolCall(payload: ChatToolCallRerunEvent) {
    const sessionId = chatSession.activeSessionId
    const currentMessages = chatSession.getSessionMessages(sessionId)

    try {
      const nextMessages = await executeToolCallRerun({
        messages: currentMessages,
        payload: {
          args: payload.args,
          index: payload.index,
          messageId: payload.message.id,
          sessionId,
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
        },
        resolveTools: () => resolveLlmTools(),
      })
      chatSession.setSessionMessages(sessionId, nextMessages)
    }
    catch (error) {
      chatSession.setSessionMessages(sessionId, [
        ...currentMessages,
        {
          content: errorMessageFrom(error) ?? 'Failed to rerun tool call.',
          role: 'error',
        },
      ])
    }
  }

  return {
    rerunToolCall,
  }
}
