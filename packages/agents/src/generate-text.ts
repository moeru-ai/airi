import type { Conversation } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { streamFrom } from '@proj-airi/core-agent'

/**
 * Sends one conversation to a chat model and resolves to the complete reply text.
 *
 * Agents receive this function instead of a provider, so each runtime keeps its own request policy.
 * For example, stage-ui passes its LLM store, which remembers provider compatibility.
 */
export type GenerateText = (conversation: Conversation, signal: AbortSignal) => Promise<string>

/**
 * Creates a {@link GenerateText} that streams with the core-agent runtime and collects the text deltas.
 *
 * Use when:
 * - A caller has no runtime of its own, for example an eval or a script.
 *
 * Returns:
 * - A generator that requests no tools.
 */
export function generateTextFrom(model: string, provider: GenerationProvider): GenerateText {
  return async (conversation, signal) => {
    let reply = ''
    await streamFrom({
      model,
      chatProvider: provider,
      conversation,
      options: {
        supportsTools: false,
        abortSignal: signal,
        onStreamEvent: (event) => {
          if (event.type === 'text-delta')
            reply += event.text
        },
      },
    })
    return reply
  }
}
