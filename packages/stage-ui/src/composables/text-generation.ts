import type { GenerateText } from '@proj-airi/agents'

import { useLLM } from '../stores/ai/chat-llm/llm'
import { useProviderStore } from '../stores/providers/provider'

/**
 * Sends one conversation to a chat model for a task beside the chat, for example a voice end judgement or a tool card.
 *
 * Returns:
 * - `generateText`, which sends a conversation through the LLM store with reasoning off. A request gets only the tools
 *   that the task passes, never the tools of the chat. The store remembers provider compatibility.
 */
export function useTextGeneration() {
  const llm = useLLM()
  const providers = useProviderStore()

  function generateText(selection: { providerId: string, model: string }): GenerateText {
    return async (conversation, signal, tools) => {
      const provider = await providers.getChatProviderInstance(selection.providerId, { reasoning: 'disabled' })
      let reply = ''
      await llm.stream(selection.model, provider, conversation, {
        // A task with tools still follows the learned compatibility of the model, so a model without tools answers without them.
        supportsTools: tools ? undefined : false,
        taskTools: tools,
        abortSignal: signal,
        onStreamEvent: (event) => {
          // Text before a tool call only leads up to the call. The reply is the text after the last call.
          if (event.type === 'tool-call')
            reply = ''
          if (event.type === 'text-delta')
            reply += event.text
        },
      })
      return reply
    }
  }

  return { generateText }
}
