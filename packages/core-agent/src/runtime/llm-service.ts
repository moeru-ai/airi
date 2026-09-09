import type { GenerationRequest } from '@proj-airi/provider-inference'
import type { Usage } from '@xsai/shared-chat'

import type { StreamEvent, StreamFromOptions, StreamOptions } from '../types/llm'

import { streamChatCompletions } from './chat-completions'
import { createContinuationScope } from './request-context'
import { streamResponses } from './responses'

/** Builds a compatibility-cache key from the same configuration used by the request. */
export function modelKey(model: string, { protocol, config }: GenerationRequest): string {
  return `${protocol === 'responses' ? 'responses:' : ''}${config.baseURL}-${model}`
}

async function resolveTools(options?: StreamOptions) {
  const tools = typeof options?.tools === 'function'
    ? await options.tools()
    : options?.tools
  return tools ?? []
}

/** Runs the selected protocol adapter and waits for its generated turn and event consumers. */
export async function streamFrom({
  model,
  chatProvider,
  conversation,
  options,
  builtinToolsResolver,
}: StreamFromOptions) {
  // Resolve before async tool loading so all decisions use this request's configuration.
  const request = chatProvider.generation(model)
  const key = modelKey(model, request)
  const supportedTools = options?.supportsTools ?? (options?.toolsCompatibility?.get(key) !== false)
  const supportsContentArray = options?.supportsContentArray ?? (options?.contentArrayCompatibility?.get(key) !== false)
  const builtinTools = supportedTools
    ? await (builtinToolsResolver?.(model, chatProvider) ?? Promise.resolve([]))
    : []
  const customTools = supportedTools ? await resolveTools(options) : []
  const mergedTools = supportedTools ? [...builtinTools, ...customTools] : []
  const tools = mergedTools.length > 0 ? mergedTools : undefined

  const scope = await createContinuationScope(request.config, options)

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
        ? streamResponses({ config: request.config, webSearch: request.webSearch, conversation, scope, options, tools, onEvent })
        : streamChatCompletions({ config: request.config, conversation, scope, options, tools, onEvent, supportsContentArray })

      // NOTICE: Consume underlying promises to prevent unhandled rejections from
      // @xsai/stream-text's SSE parser surfacing as faulted app state.
      // NOTICE:
      // `streamText(...).steps` is the authoritative completion signal for the
      // full streamed interaction, including tool-call rounds.
      // Resolving only from `onEvent({ type: 'finish' })` is incorrect when
      // `options?.waitForTools === true`, because providers can emit
      // `finishReason: 'tool_calls'` or `finishReason: 'tool-calls'` before the
      // tool round has fully settled.
      // That misuse leaves the outer promise pending, which makes provider-backed
      // eval tasks look like they stop mid-run and prevents later scheduled evals
      // from starting.
      // Keep `steps.then(resolveOnce)` so evaluation runners observe the real end
      // of the stream lifecycle instead of an intermediate tool boundary.
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
        console.error('Stream steps error:', error)
      })
      // `steps` can reject before the success path awaits `messages`.
      // Keep this rejection sink so xsAI cannot create an unhandled rejection.
      void streamResult.generatedTurn.catch(error => console.error('Stream generated turn error:', error))
      void streamResult.usage.catch(error => console.error('Stream usage error:', error))
      // `steps` and `totalUsage` reject independently when xsAI fails a
      // stream. The success path awaits `totalUsage`, but if `steps` rejects
      // first that await never runs, so keep this unconditional rejection sink.
      void streamResult.totalUsage.catch(error => console.error('Stream totalUsage error:', error))
    }
    catch (error) {
      rejectOnce(error)
    }
  })
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
