import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Tool } from '@xsai/shared-chat'

import type { Conversation } from '../messages/types'
import type { StreamEvent, StreamOptions } from '../types/llm'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

import { chatMessagesToProjectionEntries, conversationToChatMessages } from '../messages/chat-completions'
import { createAssistantTurn, recordRound } from './generation'
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
  const turn = createAssistantTurn(input.options?.requestCorrelation?.turnId, input.options?.requestCorrelation?.runId)
  const starts: number[] = []
  const result = streamText({
    prepareStep: ({ input: current }) => {
      // SDK callbacks receive snapshots. Retain offsets, not references to those snapshots.
      starts.push(current.length)
      return {}
    },
    ...input.config,
    abortSignal: input.options?.abortSignal,
    temperature: input.options?.temperature,
    topP: input.options?.topP,
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
  const transcript = Promise.all([result.messages, result.steps]).then(([final, steps]) => {
    for (const [index, step] of steps.entries()) {
      const start = starts[index]
      if (start === undefined)
        throw new Error('Missing SDK model step boundary')
      const output = final.slice(start, starts[index + 1] ?? final.length)
      recordRound(turn, { protocol: 'chat-completions', scope: input.scope, data: output }, step, input.config.model, item => chatMessagesToProjectionEntries([item]))
    }
    const lastStep = steps.at(-1)
    if ((lastStep?.finishReason === 'tool-calls' || lastStep?.finishReason === 'tool_calls') && lastStep.toolCalls.length > 0 && lastStep.toolResults.length === 0)
      throw new Error('Generation tool step limit reached')
    return turn
  })
  return { ...result, transcript }
}
