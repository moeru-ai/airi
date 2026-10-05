import type { ChatToolCallRerunEvent } from '@proj-airi/stage-ui/stores/tool-call-rerun'

import { errorMessageFrom } from '@moeru/std'
import { useChatVision } from '@proj-airi/stage-ui/composables/vision/use-chat-vision'
import { resolveLlmTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/tool-resolver'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { executeToolCallRerun } from '@proj-airi/stage-ui/stores/tool-call-rerun'

export function useChatToolCallRerun() {
  const chatSession = useChatSessionStore()
  const consciousnessStore = useConsciousnessStore()
  const chatVision = useChatVision()

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
        // A rerun stores its result in history, so it reads images like a send.
        resolveTools: () => resolveLlmTools({ describeImage: chatVision.toolImageReader(consciousnessStore.activeModel) }),
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
