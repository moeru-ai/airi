import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Event, Tool, Usage } from '@xsai/shared-chat'

import type { ConversationContext } from '../messages/types'
import type { StreamEvent, StreamFromOptions, StreamOptions } from '../types/llm'

import { streamChatCompletions } from './chat-completions'
import { streamResponses } from './responses'

export function modelKey(model: string, chatProvider: GenerationProvider): string {
  const provider: GenerationProvider = chatProvider
  const config = provider.responses ? provider.responses(model) : provider.chat(model)
  return `${provider.responses ? 'responses:' : ''}${config.baseURL}-${model}`
}

export function streamOptionsToolsCompatibilityOk(model: string, chatProvider: GenerationProvider, options?: StreamOptions): boolean {
  if (options?.supportsTools !== undefined)
    return options.supportsTools
  const key = modelKey(model, chatProvider)
  return options?.toolsCompatibility?.get(key) !== false
}

/**
 * Resolve whether the active model+provider currently supports content-part
 * arrays. Defaults to `true` so first-time calls keep multimodal payloads;
 * flips to `false` once {@link isContentArrayRelatedError} has fired on this
 * model key and the caller has cached the degrade in
 * {@link StreamOptions.contentArrayCompatibility}.
 */
export function streamOptionsContentArrayCompatibilityOk(model: string, chatProvider: GenerationProvider, options?: StreamOptions): boolean {
  if (options?.supportsContentArray !== undefined)
    return options.supportsContentArray
  const key = modelKey(model, chatProvider)
  return options?.contentArrayCompatibility?.get(key) !== false
}

async function resolveTools(options?: StreamOptions) {
  const tools = typeof options?.tools === 'function'
    ? await options.tools()
    : options?.tools
  return tools ?? []
}

/**
 * Maps xsAI stream events onto the AIRI {@link StreamEvent} contract.
 *
 * xsAI 0.5.0-beta.8 marks failed tool executions with `isError: true` on
 * `tool-result.done` instead of aborting the stream, so AIRI can distinguish
 * `tool-error` from `tool-result` directly from the event payload.
 */
function toAiriStreamEvent(event: Event): StreamEvent | null {
  switch (event.type) {
    case 'text.delta':
      return { type: 'text-delta', text: event.delta }
    case 'reasoning.delta':
      return { type: 'reasoning-delta', text: event.delta }
    case 'tool-call.done':
      return { ...event, type: 'tool-call' }
    case 'tool-result.done':
      if (event.isError === true)
        return { ...event, type: 'tool-error', isError: true }
      return {
        type: 'tool-result',
        toolCallId: event.toolCallId,
        result: typeof event.result === 'string' || Array.isArray(event.result)
          ? event.result
          : JSON.stringify(event.result),
      }
    case 'error':
      return {
        type: 'error',
        error: event.cause ?? new Error(event.message),
      }
    case 'text.start':
    case 'text.done':
    case 'reasoning.start':
    case 'reasoning.done':
    case 'step.start':
    case 'step.done':
    case 'tool-call.start':
    case 'tool-call.delta':
      return null
  }
}

function startStream(provider: GenerationProvider, model: string, context: ConversationContext, options: StreamOptions | undefined, tools: Tool[] | undefined, onEvent: (event: Event) => Promise<void>) {
  if (provider.responses) {
    const config = provider.responses(model)
    const scope = JSON.stringify([options?.providerId, String(config.baseURL), model, options?.requestCorrelation?.conversationId])
    return streamResponses({ config, context, scope, options, tools, onEvent })
  }
  const config = provider.chat(model)
  return streamChatCompletions({
    config,
    context,
    options,
    tools,
    onEvent,
    scope: JSON.stringify([options?.providerId, String(config.baseURL), model, options?.requestCorrelation?.conversationId]),
    supportsContentArray: streamOptionsContentArrayCompatibilityOk(model, provider, options),
  })
}

/** Runs the selected protocol adapter and waits for its transcript and event consumers. */
export async function streamFrom({
  model,
  chatProvider,
  context,
  options,
  builtinToolsResolver,
}: StreamFromOptions) {
  const provider: GenerationProvider = chatProvider

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, options)
  const builtinTools = supportedTools
    ? await (builtinToolsResolver?.(model, chatProvider) ?? Promise.resolve([]))
    : []
  const customTools = supportedTools ? await resolveTools(options) : []
  const mergedTools = supportedTools ? [...builtinTools, ...customTools] : []
  const tools = mergedTools.length > 0 ? mergedTools : undefined

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

    const onEvent = async (event: Event) => {
      try {
        const streamEvent = toAiriStreamEvent(event)
        if (streamEvent != null)
          await options?.onStreamEvent?.(streamEvent)
        if (streamEvent?.type === 'error')
          rejectOnce(streamEvent.error)
      }
      catch (error) {
        rejectOnce(error)
        if (provider.responses)
          throw error
      }
    }

    try {
      const streamResult = startStream(provider, model, context, options, tools, onEvent)

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
          const transcript = await streamResult.transcript
          await options?.onStreamEvent?.({ type: 'finish' })
          if (options?.abortSignal?.aborted)
            throw options.abortSignal.reason
          await options?.onTranscript?.(transcript)
        }
        catch (error) {
          // Terminal consumers and transcript persistence belong to generation
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
      void streamResult.transcript.catch(error => console.error('Stream transcript error:', error))
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
