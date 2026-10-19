import type { GenerateText } from '@proj-airi/agents'

import { useLLM } from '../stores/ai/chat-llm/llm'
import { useProviderStore } from '../stores/providers/provider'

/**
 * Sends one conversation to a chat model for a task beside the chat, for example a voice end judgement or a tool card.
 *
 * Returns:
 * - `generateText`, which sends a conversation through the LLM store with reasoning off and without tools.
 *   The store remembers Provider compatibility.
 */
export function useTextGeneration() {
  const llm = useLLM()
  const providers = useProviderStore()

  function generateText(selection: { providerId: string, model: string }): GenerateText {
    return async (conversation, signal) => {
      const provider = await providers.getChatProviderInstance(selection.providerId, { reasoning: 'disabled' })
      let reply = ''
      await llm.stream(selection.model, provider, conversation, {
        supportsTools: false,
        abortSignal: signal,
        onStreamEvent: (event) => {
          if (event.type === 'text-delta')
            reply += event.text
        },
      })
      return reply
    }
  }

  return { generateText }
}
