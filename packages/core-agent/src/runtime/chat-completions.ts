import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CompletionStep, Message, Tool } from '@xsai/shared-chat'

import type { Conversation } from '../messages/types'
import type { StreamEvent, StreamOptions } from '../types/llm'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

import { chatMessagesToProjectionEntries, conversationToChatMessages } from '../messages/chat-completions'
import { createGeneration } from './generation'
import { ProtocolSwitch } from './protocol-switch'
import { createContinuationScope, mergeRequestHeaders, supportsContentArray, supportsTools } from './request-context'
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
  const scopes: string[] = []
  const generation = createGeneration({
    turnId: input.options?.requestCorrelation?.turnId ?? input.options?.generationTurnId,
    runId: input.options?.requestCorrelation?.runId,
    model: input.config.model,
    roundOffset: input.options?.generationRoundOffset,
    continuation: (data: Message[], index) => ({ protocol: 'chat-completions' as const, scope: scopes[index] ?? input.scope, data }),
    project: item => chatMessagesToProjectionEntries([item]),
  })
  const requestOptions: Parameters<typeof streamText>[0] = {
    ...input.config,
    prepareStep: ({ input: current, steps }: { input: Message[], steps: CompletionStep[] }) => {
      const resolveStep = input.options?.resolveStep
      if (!resolveStep) {
        scopes.push(input.scope)
        return generation.prepareStep({ input: current })
      }
      return (async () => {
        const next = await resolveStep()

        const nextRequest = next.chatProvider.generation(next.model)
        if (nextRequest.protocol !== 'chat-completions') {
          const partialTurn = await generation.complete(Promise.resolve(current), Promise.resolve(steps))
          throw new ProtocolSwitch(next, partialTurn)
        }

        if (next.supportsAudioInput === false) {
          for (const message of current) {
            if (!Array.isArray(message.content))
              continue
            for (const [index, part] of message.content.entries()) {
              if (part.type !== 'input_audio')
                continue
              if (!input.options?.transcribeAudio)
                throw new Error('The selected model cannot accept audio and no transcription adapter is available')
              message.content[index] = { type: 'text', text: await input.options.transcribeAudio(part.input_audio.data, part.input_audio.format) }
            }
          }
        }

        // NOTICE:
        // xsAI prepareStep can return only input/model/toolChoice. Its 0.5 streamText
        // implementation reads the mutable options after prepareStep for each request.
        // Update provider settings and tools here until xsAI offers a typed step config.
        // Source: @xsai/stream-text 0.5 dist/index.js doStream. Remove then.
        const toolsSupported = supportsTools(next.model, nextRequest, input.options)
        Object.assign(requestOptions, nextRequest.config, {
          temperature: next.temperature,
          topP: next.topP,
          headers: mergeRequestHeaders(nextRequest.config.headers, input.options?.headers),
          tools: toolsSupported && next.tools?.length ? next.tools : undefined,
          toolChoice: toolsSupported ? input.options?.toolChoice : undefined,
        })
        generation.prepareStep({ input: current, model: next.model })
        scopes.push(createContinuationScope(nextRequest.config, { ...input.options, providerId: next.providerId }))
        if (!supportsContentArray(next.model, nextRequest, input.options)) {
          for (const [index, message] of current.entries()) {
            if (!Array.isArray(message.content))
              continue
            current[index] = {
              ...message,
              content: message.content.map(part => part.type === 'text' ? part.text : part.type === 'refusal' ? part.refusal : '').join(''),
            } as Message
          }
        }
        const systemIndex = current.findIndex(message => message.role === 'system')
        const systemMessage = current[systemIndex]
        if (systemMessage?.role === 'system')
          current[systemIndex] = { ...systemMessage, content: next.systemPrompt }
        else if (next.systemPrompt)
          current.unshift({ role: 'system', content: next.systemPrompt })

        return { input: current, model: next.model }
      })()
    },
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
  }
  const result = streamText(requestOptions)
  const generatedTurn = generation.complete(result.messages, result.steps)
  return { ...result, generatedTurn }
}
