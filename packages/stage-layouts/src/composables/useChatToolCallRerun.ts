import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { errorMessageFrom } from '@moeru/std'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { resolveLlmTools } from '@proj-airi/stage-ui/stores/llm-tool-resolver'
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
        resolveTools: () => resolveLlmTools(),
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
