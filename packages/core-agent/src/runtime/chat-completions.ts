import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Event, Tool } from '@xsai/shared-chat'

import type { ConversationContext } from '../messages/types'
import type { StreamOptions } from '../types/llm'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

import { readChatMessages, renderChatContext } from '../messages/chat-completions'

/** Projects one context snapshot and returns only the newly generated turn. */
export function streamChatCompletions(input: {
  config: ReturnType<ChatProvider['chat']>
  scope: string
  context: ConversationContext
  supportsContentArray: boolean
  options?: StreamOptions
  tools?: Tool[]
  onEvent: (event: Event) => Promise<void>
}) {
  const messages = renderChatContext(input.context, input.supportsContentArray, input.scope)
  const result = streamText({
    ...input.config,
    abortSignal: input.options?.abortSignal,
    messages,
    headers: { ...input.config.headers, ...input.options?.headers },
    streamOptions: { includeUsage: true },
    stopWhen: stepCountAtLeast(10),
    tools: input.tools,
    toolChoice: input.options?.toolChoice,
    onEvent: input.onEvent,
  })
  const transcript = result.messages.then((final) => {
    const output = final.slice(messages.length)
    if (!output.length)
      return { messages: [] }
    return { messages: readChatMessages(output), continuation: { protocol: 'chat-completions', scope: input.scope, data: output } }
  })
  return { ...result, transcript }
}
