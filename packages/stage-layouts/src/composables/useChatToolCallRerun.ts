import type { ChatToolCallRerunEvent } from '@proj-airi/stage-ui/stores/tool-call-rerun'

import { errorMessageFrom } from '@moeru/std'
import { resolveLlmTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/tool-resolver'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { executeToolCallRerun } from '@proj-airi/stage-ui/stores/tool-call-rerun'

export function useChatToolCallRerun() {
  const chatSession = useChatSessionStore()

  /**
   * Triggering workflow: ChatHistory `toolCallRerun` -> rerunToolCall
   * -> {@link executeToolCallRerun} -> chatSession.setSessionMessages.
   */
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
          invocationId: payload.invocationId,
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
