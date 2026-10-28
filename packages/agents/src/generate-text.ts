import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { streamFrom } from '@proj-airi/core-agent'

/**
 * Sends one conversation to a chat model and resolves to the complete reply text.
 *
 * Agents receive this function instead of a provider, so each runtime keeps its own request policy.
 * For example, stage-ui passes its LLM store, which remembers provider compatibility.
 *
 * `tools` are the only tools of the request, for example an icon search. The provider adds none of its own, such as a
 * web search. Text before a tool call only leads up to the call, so the reply is the text after the last call.
 */
export type GenerateText = (conversation: Conversation, signal: AbortSignal, tools?: Extract<StreamOptions['tools'], unknown[]>) => Promise<string>

/**
 * Creates a {@link GenerateText} that streams with the core-agent runtime and collects the text deltas.
 *
 * Use when:
 * - A caller has no runtime of its own, for example an eval or a script.
 *
 * Returns:
 * - A generator that requests only the tools that a call passes.
 */
export function generateTextFrom(model: string, provider: GenerationProvider): GenerateText {
  return async (conversation, signal, tools) => {
    let reply = ''
    await streamFrom({
      model,
      chatProvider: provider,
      conversation,
      options: {
        supportsTools: Boolean(tools),
        tools,
        providerTools: false,
        abortSignal: signal,
        onStreamEvent: (event) => {
          if (event.type === 'tool-call')
            reply = ''
          if (event.type === 'text-delta')
            reply += event.text
        },
      },
    })
    return reply
  }
}
