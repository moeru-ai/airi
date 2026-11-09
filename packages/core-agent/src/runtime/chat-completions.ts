import type { GenerationRequest } from '@proj-airi/provider-inference'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CompletionStep, Message, Tool } from '@xsai/shared-chat'

import type { Conversation } from '../messages/types'
import type { StreamEvent, StreamOptions } from '../types/llm'
import type { ResolvedStep } from './request-context'

import { hasToolCall, not } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

import { chatMessagesToProjectionEntries, conversationToChatMessages } from '../messages/chat-completions'
import { measureContextBudget, resolveContextBudgetLimits } from '../messages/context-budget'
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
  // The caller's tool choice applies to the first model request of the generation. A choice that forces a tool
  // call on every request leaves the model no way to answer, and the tool loop has no step limit.
  const callerToolChoice = (steps: readonly CompletionStep[]) =>
    steps.length === 0 && !input.options?.generationRoundOffset ? input.options?.toolChoice : undefined
  let providerConfigKeys = Object.keys(input.config)
  const requestOptions: Parameters<typeof streamText>[0] = {
    ...input.config,
    prepareStep: async ({ input: current, steps }: { input: Message[], steps: CompletionStep[] }) => {
      const sdkInput = current
      const completed = generation.snapshot(current, steps)
      const resolveStep = input.options?.resolveStep
      let next: ResolvedStep | undefined
      let request: GenerationRequest = { protocol: 'chat-completions', config: input.config }
      let contentArraySupported = input.supportsContentArray
      if (resolveStep) {
        const firstStep = scopes.length === 0 && input.initialStep
        next = firstStep || await resolveStep()

        const nextRequest = firstStep
          ? { protocol: 'chat-completions' as const, config: input.config }
          : next.chatProvider.generation(next.model)
        const nextScope = createContinuationScope(nextRequest.config, { ...input.options, providerId: next.providerId })
        if (nextRequest.protocol !== 'chat-completions' || nextScope !== input.scope) {
          const partialTurn = await generation.complete(Promise.resolve(current), Promise.resolve(steps))
          throw new RequestSwitch(next, partialTurn)
        }
        request = nextRequest

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
          maxTokens: next.maxTokens ?? input.options?.maxTokens,
          headers: mergeRequestHeaders(nextRequest.config.headers, next.headers),
          tools: toolsSupported && next.tools?.length ? next.tools : undefined,
          toolChoice: undefined,
        })
        contentArraySupported = supportsContentArray(next.model, nextRequest, input.options)
      }
      const project = (conversation: Conversation) => {
        const projected = conversationToChatMessages(conversation, contentArraySupported, input.scope)
        if (!next)
          return projected
        const systemIndex = projected.findIndex(message => message.role === 'system')
        const systemMessage = projected[systemIndex]
        if (systemMessage?.role === 'system')
          projected[systemIndex] = { ...systemMessage, content: next.systemPrompt }
        else if (next.systemPrompt)
          projected.unshift({ role: 'system', content: next.systemPrompt })
        return projected
      }
      if (input.options?.prepareConversation || input.options?.prepareStringContent || next) {
        const contextWindowTokens = next ? next.contextWindowTokens : input.options?.contextWindowTokens
        const modelMaxOutputTokens = next ? next.modelMaxOutputTokens : input.options?.modelMaxOutputTokens
        const contextBudgetLimits = resolveContextBudgetLimits({
          contextWindowTokens,
          requestedOutputTokens: typeof requestOptions.maxTokens === 'number' ? requestOptions.maxTokens : undefined,
          modelMaxOutputTokens,
        })
        let conversation: Conversation = completed.rounds.length
          ? { turns: [...input.conversation.turns, completed] }
          : input.conversation
        conversation = await input.options?.prepareConversation?.(conversation, {
          model: next?.model ?? input.config.model,
          providerId: next?.providerId ?? input.options?.providerId,
          request,
          scope: input.scope,
          contextWindowTokens,
          modelMaxOutputTokens,
          contextBudgetLimits: contextBudgetLimits.source === 'provider-model-metadata' ? contextBudgetLimits : undefined,
          measureContextBytes: source => new TextEncoder().encode(JSON.stringify({ messages: project(source), tools: requestOptions.tools })).byteLength,
          measureContextBudget: source => measureContextBudget({ messages: project(source), tools: requestOptions.tools }),
          supportsVisionInput: next ? next.supportsVisionInput === true : input.options?.supportsVisionInput === true,
        }) ?? conversation
        input.options?.abortSignal?.throwIfAborted()
        current = project(conversation)
      }
      // xsAI appends output to its original array, not the projected request array.
      scopes.push(input.scope)
      generation.prepareStep({ input: sdkInput, model: next?.model })

      return { input: current, model: next?.model ?? input.config.model, toolChoice: !next || requestOptions.tools?.length ? callerToolChoice(steps) : undefined }
    },
    abortSignal: input.options?.abortSignal,
    temperature: input.options?.temperature,
    topP: input.options?.topP,
    maxTokens: input.options?.maxTokens,
    messages,
    headers: mergeRequestHeaders(input.config.headers, input.options?.headers),
    streamOptions: { includeUsage: true },
    // The tool loop has no step limit. It stops when the model answers without a tool call.
    stopWhen: not(hasToolCall()),
    tools: input.tools,
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
