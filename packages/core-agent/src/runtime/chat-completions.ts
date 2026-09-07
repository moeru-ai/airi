import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Tool } from '@xsai/shared-chat'

import type { ConversationContext, ConversationTurn } from '../messages/types'
import type { StreamEvent, StreamOptions } from '../types/llm'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

import { readChatMessages, renderChatContext } from '../messages/chat-completions'
import { toAiriStreamEvent } from './xsai-events'

/** Projects one context snapshot and returns only the newly generated turn. */
export function streamChatCompletions(input: {
  config: ReturnType<ChatProvider['chat']>
  scope: string
  context: ConversationContext
  supportsContentArray: boolean
  options?: StreamOptions
  tools?: Tool[]
  onEvent: (event: StreamEvent) => Promise<void>
}) {
  const messages = renderChatContext(input.context, input.supportsContentArray, input.scope)
  const result = streamText({
    ...input.config,
    abortSignal: input.options?.abortSignal,
    messages,
    headers: { ...Object.fromEntries(new Headers(input.config.headers)), ...input.options?.headers },
    streamOptions: { includeUsage: true },
    stopWhen: stepCountAtLeast(10),
    tools: input.tools,
    toolChoice: input.options?.toolChoice,
    onEvent: async (event) => {
      const mapped = toAiriStreamEvent(event)
      if (mapped)
        await input.onEvent(mapped)
    },
  })
  const transcript = result.messages.then((final): ConversationTurn => {
    const output = final.slice(messages.length)
    if (!output.length)
      return { messages: [] }
    return { messages: readChatMessages(output), continuation: { protocol: 'chat-completions', scope: input.scope, data: output } }
  })
  return { ...result, transcript }
}
