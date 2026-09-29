import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CompletionStep, Message, Tool } from '@xsai/shared-chat'

import type { Conversation } from '../messages/types'
import type { StreamEvent, StreamOptions } from '../types/llm'
import type { ResolvedStep } from './request-context'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

import { chatContentToString, chatMessagesToProjectionEntries, conversationToChatMessages } from '../messages/chat-completions'
import { createGeneration } from './generation'
import { createContinuationScope, mergeRequestHeaders, replaceProviderConfig, supportsContentArray, supportsTools } from './request-context'
import { RequestSwitch } from './request-switch'
import { toAiriStreamEvent } from './xsai-events'

/** Projects one context snapshot and returns only the newly generated turn. */
export function streamChatCompletions(input: {
  config: ReturnType<ChatProvider['chat']>
  scope: string
  conversation: Conversation
  supportsContentArray: boolean
  options?: StreamOptions
  tools?: Tool[]
  initialStep?: ResolvedStep
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
  let providerConfigKeys = Object.keys(input.config)
  const requestOptions: Parameters<typeof streamText>[0] = {
    ...input.config,
    prepareStep: ({ input: current, steps }: { input: Message[], steps: CompletionStep[] }) => {
      const resolveStep = input.options?.resolveStep
      if (!resolveStep) {
        scopes.push(input.scope)
        return generation.prepareStep({ input: current })
      }
      return (async () => {
        const firstStep = scopes.length === 0 && input.initialStep
        const next = firstStep || await resolveStep()

        const nextRequest = firstStep
          ? { protocol: 'chat-completions' as const, config: input.config }
          : next.chatProvider.generation(next.model)
        const nextScope = createContinuationScope(nextRequest.config, { ...input.options, providerId: next.providerId })
        if (nextRequest.protocol !== 'chat-completions' || nextScope !== input.scope) {
          const partialTurn = await generation.complete(Promise.resolve(current), Promise.resolve(steps))
          throw new RequestSwitch(next, partialTurn)
        }

        // NOTICE:
        // xsAI 0.5 prepareStep returns only input, model, and toolChoice.
        // It reads other options afterward but snapshots toolChoice beforehand.
        // Source: @xsai/stream-text 0.5 doStream and @xsai/shared-chat resolvePrepareStep.
        // Remove this mutation when xsAI supports typed provider options for each step.
        const toolsSupported = supportsTools(next.model, nextRequest, input.options)
        providerConfigKeys = replaceProviderConfig(requestOptions, providerConfigKeys, nextRequest.config)
        Object.assign(requestOptions, {
          apiKey: nextRequest.config.apiKey,
          fetch: nextRequest.config.fetch,
          temperature: next.temperature,
          topP: next.topP,
          headers: mergeRequestHeaders(nextRequest.config.headers, next.headers),
          tools: toolsSupported && next.tools?.length ? next.tools : undefined,
          toolChoice: undefined,
        })
        generation.prepareStep({ input: current, model: next.model })
        const contentArraySupported = supportsContentArray(next.model, nextRequest, input.options)
        scopes.push(nextScope)
        if (!contentArraySupported) {
          for (const [index, message] of current.entries()) {
            if (!Array.isArray(message.content))
              continue
            current[index] = {
              ...message,
              content: chatContentToString(message.content),
            } as Message
          }
        }
        const systemIndex = current.findIndex(message => message.role === 'system')
        const systemMessage = current[systemIndex]
        if (systemMessage?.role === 'system')
          current[systemIndex] = { ...systemMessage, content: next.systemPrompt }
        else if (next.systemPrompt)
          current.unshift({ role: 'system', content: next.systemPrompt })

        return { input: current, model: next.model, toolChoice: toolsSupported ? input.options?.toolChoice : undefined }
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
    toolChoice: input.options?.resolveStep ? undefined : input.options?.toolChoice,
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
