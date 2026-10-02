import type { Usage } from '@xsai/shared-chat'

import type { AssistantTurn, GenerationRound } from '../messages/types'
import type { StreamEvent, StreamFromOptions, StreamOptions } from '../types/llm'

import { streamChatCompletions } from './chat-completions'
import { createContinuationScope, supportsContentArray, supportsTools } from './request-context'
import { RequestSwitch } from './request-switch'
import { streamResponses } from './responses'

export { modelKey } from './request-context'

async function resolveTools(options?: StreamOptions) {
  const tools = typeof options?.tools === 'function'
    ? await options.tools()
    : options?.tools
  return tools ?? []
}

/** Runs the selected protocol adapter and waits for its generated turn and event consumers. */
async function streamOnce({
  model,
  chatProvider,
  conversation,
  options,
  builtinToolsResolver,
}: StreamFromOptions) {
  const initialStep = await options?.resolveStep?.()
  const currentModel = initialStep?.model ?? model
  const currentProvider = initialStep?.chatProvider ?? chatProvider
  // Resolve before async tool loading so all decisions use this request's configuration.
  const request = currentProvider.generation(currentModel)
  const supportedTools = supportsTools(currentModel, request, options)
  const contentArraySupported = supportsContentArray(currentModel, request, options)
  const builtinTools = supportedTools && !initialStep
    ? await (builtinToolsResolver?.(model, chatProvider) ?? Promise.resolve([]))
    : []
  const customTools = supportedTools
    ? initialStep ? initialStep.tools ?? [] : await resolveTools(options)
    : []
  const mergedTools = supportedTools ? [...builtinTools, ...customTools] : []
  const tools = mergedTools.length > 0 ? mergedTools : undefined

  const scope = createContinuationScope(request.config, { ...options, providerId: initialStep?.providerId ?? options?.providerId })

  return new Promise<void>((resolve, reject) => {
    let settled = false
    let stepsSettled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }
    const rejectOnce = (error: unknown) => {
      if (settled || stepsSettled)
        return
      settled = true
      reject(error)
    }

    const onEvent = async (streamEvent: StreamEvent) => {
      try {
        if (streamEvent != null)
          await options?.onStreamEvent?.(streamEvent)
        if (streamEvent?.type === 'error')
          rejectOnce(streamEvent.error)
      }
      catch (error) {
        rejectOnce(error)
        if (request.protocol === 'responses')
          throw error
      }
    }

    try {
      const streamResult = request.protocol === 'responses'
        ? streamResponses({ config: request.config, webSearch: supportedTools && request.webSearch, conversation, scope, options, tools, initialStep, onEvent })
        : streamChatCompletions({ config: request.config, conversation, scope, options, tools, initialStep, onEvent, supportsContentArray: contentArraySupported })

      // NOTICE:
      // `steps` settles after all tool rounds, while provider finish events can arrive earlier.
      // Await it and consume other SDK promises to prevent stalled evals and unhandled rejections.
      // Source: @xsai/stream-text 0.5 steps and AIRI eval runners.
      // Remove this path when xsAI emits one terminal event after all tool rounds.
      void streamResult.steps.then(async () => {
        if (settled)
          return
        // Ignore any late provider error event emitted after xsAI has already
        // resolved the authoritative full-step lifecycle.
        stepsSettled = true
        try {
          const generatedTurn = await streamResult.generatedTurn
          await options?.onStreamEvent?.({ type: 'finish' })
          if (options?.abortSignal?.aborted)
            throw options.abortSignal.reason
          await options?.onGeneratedTurn?.(generatedTurn)
        }
        catch (error) {
          // Terminal consumers and generated turn persistence belong to generation
          // completion. Their failures are not ignorable late provider events.
          if (!settled) {
            settled = true
            reject(error)
          }
          return
        }
        let usage: Usage | undefined
        try {
          usage = await streamResult.totalUsage
        }
        catch (error) {
          console.error('Stream totalUsage error:', error)
        }
        try {
          const normalizedUsage = !usage
            || (usage.inputTokens == null && usage.outputTokens == null && usage.totalTokens == null)
            ? { source: 'unavailable' as const }
            : { ...usage, source: 'reported' as const }
          await options?.onUsage?.(normalizedUsage)
        }
        catch (error) {
          // Usage observers are telemetry-only and must not turn a completed
          // provider response into a failed user message.
          console.error('Stream usage callback error:', error)
        }
        resolveOnce()
      }).catch((error) => {
        // A failure after `steps` resolved belongs to optional usage
        // observation and cannot invalidate the completed response.
        if (stepsSettled) {
          console.error('Stream usage observation error:', error)
          resolveOnce()
          return
        }
        rejectOnce(error)
        if (!(error instanceof RequestSwitch))
          console.error('Stream steps error:', error)
      })
      // `steps` can reject before the success path awaits `messages`.
      // Keep this rejection sink so xsAI cannot create an unhandled rejection.
      void streamResult.generatedTurn.catch((error) => {
        if (!(error instanceof RequestSwitch))
          console.error('Stream generated turn error:', error)
      })
      void streamResult.usage.catch((error) => {
        if (!(error instanceof RequestSwitch))
          console.error('Stream usage error:', error)
      })
      // `steps` and `totalUsage` reject independently when xsAI fails a
      // stream. The success path awaits `totalUsage`, but if `steps` rejects
      // first that await never runs, so keep this unconditional rejection sink.
      void streamResult.totalUsage.catch((error) => {
        if (!(error instanceof RequestSwitch))
          console.error('Stream totalUsage error:', error)
      })
    }
    catch (error) {
      rejectOnce(error)
    }
  })
}

function mergeGenerationUsage(rounds: GenerationRound[], last?: Parameters<NonNullable<StreamOptions['onUsage']>>[0]) {
  const partial = rounds.flatMap(round => round.modelCall?.usage ? [round.modelCall.usage] : [])
  if (partial.length === 0)
    return last

  return {
    inputTokens: partial.reduce((sum, usage) => sum + usage.inputTokens, last?.inputTokens ?? 0),
    outputTokens: partial.reduce((sum, usage) => sum + usage.outputTokens, last?.outputTokens ?? 0),
    totalTokens: partial.reduce((sum, usage) => sum + usage.totalTokens, last?.totalTokens ?? 0),
    source: 'reported' as const,
  }
}

/** Keeps one assistant turn across xsAI tool loops when the next request changes provider scope. */
export async function streamFrom(input: StreamFromOptions): Promise<void> {
  if (!input.options?.resolveStep)
    return streamOnce(input)

  const completedRounds: GenerationRound[] = []
  let turnId = input.options.requestCorrelation?.turnId
  let request = input
  let switches = 0
  while (true) {
    let finalTurn: AssistantTurn | undefined
    let lastUsage: Parameters<NonNullable<StreamOptions['onUsage']>>[0] | undefined
    try {
      await streamOnce({
        ...request,
        options: {
          ...request.options,
          generationTurnId: turnId,
          generationRoundOffset: completedRounds.length,
          onGeneratedTurn: (turn) => { finalTurn = turn },
          onUsage: (usage) => { lastUsage = usage },
        },
      })
      if (finalTurn)
        await input.options.onGeneratedTurn?.({ ...finalTurn, rounds: [...completedRounds, ...finalTurn.rounds] })
      const usage = mergeGenerationUsage(completedRounds, lastUsage)
      if (usage)
        await input.options.onUsage?.(usage)
      return
    }
    catch (error) {
      if (!(error instanceof RequestSwitch))
        throw error
      switches += 1
      if (switches > 10)
        throw new Error('Generation request scope changed too many times')
      turnId = error.partialTurn.id
      completedRounds.push(...error.partialTurn.rounds)
      if (completedRounds.length >= 10)
        throw new Error('Generation tool step limit reached')
      request = {
        ...input,
        model: error.next.model,
        chatProvider: error.next.chatProvider,
        options: { ...input.options, providerId: error.next.providerId, headers: error.next.headers },
        conversation: {
          turns: [
            ...input.conversation.turns,
            { ...error.partialTurn, rounds: [...completedRounds] },
          ],
        },
      }
    }
  }
}

// Runtime auto-degrade: patterns that indicate the model/provider does not support tool calling.
const TOOLS_RELATED_ERROR_PATTERNS: RegExp[] = [
  /does not support tools/i, // Ollama
  /no endpoints found that support tool use/i, // OpenRouter
  /invalid schema for function/i, // OpenAI-compatible
  /invalid.?function.?parameters/i, // OpenAI-compatible
  /functions are not supported/i, // Azure AI Foundry
  /unrecognized request argument.+tools/i, // Azure AI Foundry
  /tool use with function calling is unsupported/i, // Google Generative AI
  /tool_use_failed/i, // Groq
  /does not support function.?calling/i, // Anthropic
  /tools?\s+(is|are)\s+not\s+supported/i, // Cloudflare Workers AI
]

export function isToolRelatedError(error: unknown): boolean {
  const message = String(error)
  return TOOLS_RELATED_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

// Runtime auto-degrade: patterns that indicate the provider rejected
// content-part arrays and only accepts a plain string for `messages[].content`.
//
// The first pattern matches the Rust/serde wire-level error format used by
// many strict OpenAI-compatible gateways (e.g. DeepSeek-style servers):
//   "Failed to deserialize the JSON body into the target type:
//    messages[7]: invalid type: sequence, expected a string at line 1 column …"
// The second pattern covers Python/Pydantic-style errors like
//   "messages.0.content: Input should be a valid string"
// and other variants that surface the same root cause.
//
// See: https://github.com/moeru-ai/airi/issues/1500
const CONTENT_ARRAY_RELATED_ERROR_PATTERNS: RegExp[] = [
  /messages\[\d+\][^"]*invalid type:\s*sequence,\s*expected\s+a\s+string/i,
  /messages\.\d+\.content[^"]*(?:expected|should be).*string/i,
]

/**
 * Whether the given error indicates the provider rejected content-part arrays
 * and the caller should auto-degrade to string-only `content` for this model.
 *
 * Use when:
 * - Catching errors thrown by {@link streamFrom} so the chat store can flip
 *   `contentArrayCompatibility` for the failing model key.
 *
 * Expects:
 * - `error` may be an Error instance, a thrown SDK response object, a string,
 *   or anything else; we coerce via `String(error)` and pattern-match.
 *
 * Returns:
 * - `true` when the message matches a known "content array unsupported" wire
 *   format from an OpenAI-compatible gateway, otherwise `false`.
 */
export function isContentArrayRelatedError(error: unknown): boolean {
  const message = String(error)
  return CONTENT_ARRAY_RELATED_ERROR_PATTERNS.some(pattern => pattern.test(message))
}
