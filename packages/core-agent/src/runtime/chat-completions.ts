import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import type { Conversation } from '../messages/types'
import type { StreamEvent, StreamOptions } from '../types/llm'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

import { chatMessagesToProjectionEntries, conversationToChatMessages } from '../messages/chat-completions'
import { createGeneration } from './generation'
import { mergeRequestHeaders } from './request-context'
import { toAiriStreamEvent } from './xsai-events'

/** Projects one context snapshot and returns only the newly generated turn. */
export function streamChatCompletions(input: {
  config: ReturnType<ChatProvider['chat']>
  scope: string
  conversation: Conversation
  supportsContentArray: boolean
  options?: StreamOptions
  tools?: Tool[]
  onEvent: (event: StreamEvent) => Promise<void>
}) {
  const messages = conversationToChatMessages(input.conversation, input.supportsContentArray, input.scope)
  const generation = createGeneration({
    turnId: input.options?.requestCorrelation?.turnId,
    runId: input.options?.requestCorrelation?.runId,
    model: input.config.model,
    continuation: (data: Message[]) => ({ protocol: 'chat-completions' as const, scope: input.scope, data }),
    project: item => chatMessagesToProjectionEntries([item]),
  })
  const result = streamText({
    ...input.config,
    prepareStep: generation.prepareStep,
    abortSignal: input.options?.abortSignal,
    temperature: input.options?.temperature,
    topP: input.options?.topP,
    messages,
    headers: mergeRequestHeaders(input.config.headers, input.options?.headers),
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
  const generatedTurn = generation.complete(result.messages, result.steps)
  return { ...result, generatedTurn }
}
