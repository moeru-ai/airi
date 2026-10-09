import type { Usage } from '@xsai/shared-chat'

import type { AssistantTurn, GenerationRound } from '../messages/types'
import type { StreamEvent, StreamFromOptions, StreamOptions } from '../types/llm'

import { APICallError } from '@xsai/shared'

import { streamChatCompletions } from './chat-completions'
import { createContinuationScope, supportsContentArray, supportsTools, toolChoiceRequiresTools } from './request-context'
import { RequestSwitch } from './request-switch'
import { streamResponses } from './responses'
import { isPlainTextToolCallError, ToolCallGuard } from './tool-call-guard'

export { modelKey } from './request-context'
export { isPlainTextToolCallError } from './tool-call-guard'

/**
 * Automatic retry for provider requests that fail with a temporary HTTP status
 * before any stream event reaches the consumer.
 */
const transientRetry = {
  /** Wait before each retry when the provider sends no usable `Retry-After`; its length caps the retry count. */
  backoffMs: [3_000, 6_000, 12_000],
  /** Longest server-requested `Retry-After` to wait silently; a longer one fails the turn so the user decides. */
  maxRetryAfterMs: 30_000,
}

/** Returns the wait before the next attempt, or `undefined` when the failure is permanent or retries are spent. */
function transientRetryDelayMs(error: unknown, attempt: number): number | undefined {
  if (attempt >= transientRetry.backoffMs.length || !(error instanceof APICallError))
    return undefined
  // Timeout, rate limit, and server-side failures can succeed later. Other
  // 4xx statuses (auth, validation, unknown model) fail the same way again.
  if (error.statusCode !== 408 && error.statusCode !== 429 && error.statusCode < 500)
    return undefined

  // NOTICE:
  // Browsers hide `Retry-After` from cross-origin responses unless the provider
  // lists it in `Access-Control-Expose-Headers`, so the backoff is the common path.
  const retryAfter = error.responseHeaders['retry-after']
  if (!retryAfter)
    return transientRetry.backoffMs[attempt]
  // `Retry-After` is either delay seconds or an HTTP date.
  const seconds = Number(retryAfter)
  const delayMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
  if (Number.isNaN(delayMs))
    return transientRetry.backoffMs[attempt]
  return delayMs <= transientRetry.maxRetryAfterMs ? Math.max(delayMs, 0) : undefined
}

function waitBeforeRetry(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    function onAbort() {
      clearTimeout(timer)
      reject(signal?.reason)
    }
  })
}

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
  onNativeToolCall,
}: StreamFromOptions, guard: ToolCallGuard) {
  const initialStep = await options?.resolveStep?.()
  const currentModel = initialStep?.model ?? model
  const currentProvider = initialStep?.chatProvider ?? chatProvider
  // Resolve before async tool loading so all decisions use this request's configuration.
  const request = currentProvider.generation(currentModel)
  const supportedTools = supportsTools(currentModel, request, options)
  const contentArraySupported = supportsContentArray(currentModel, request, options)
  if (request.protocol === 'chat-completions' && !contentArraySupported && options?.prepareStringContent)
    conversation = await options.prepareStringContent(conversation)
  options?.abortSignal?.throwIfAborted()
  const builtinTools = supportedTools && !initialStep
    ? await (builtinToolsResolver?.(model, chatProvider) ?? Promise.resolve([]))
    : []
  const customTools = supportedTools
    ? initialStep ? initialStep.tools ?? [] : await resolveTools(options)
    : []
  const mergedTools = supportedTools ? [...builtinTools, ...customTools] : []
  const tools = mergedTools.length > 0 ? mergedTools : undefined
  if (!tools && (request.protocol !== 'responses' || !supportedTools || !request.webSearch) && toolChoiceRequiresTools(options?.toolChoice))
    throw new Error('Cannot satisfy a required tool choice because no tools are available for this request.')
  guard.addTools(mergedTools)
  if (options?.supportsTools !== false)
    guard.addTools(initialStep?.tools)

  const scope = createContinuationScope(request.config, { ...options, providerId: initialStep?.providerId ?? options?.providerId })

  return new Promise<void>((resolve, reject) => {
    // Completion closes admission. Failure stops queued work and waits for the active consumer.
    // This queue owns accepted events because xsAI does not await every onEvent callback.
    let settled = false
    let stepsSettled = false
    let failed = false
    let eventQueue = Promise.resolve()
    const resolveOnce = () => {
      if (settled || failed)
        return
      settled = true
      resolve()
    }
    const rejectOnce = (error: unknown) => {
      if (settled || failed)
        return
      failed = true
      const rejectAfterEvents = () => {
        settled = true
        reject(error)
      }
      void eventQueue.then(rejectAfterEvents, rejectAfterEvents)
    }

    const emit = async (event: StreamEvent) => {
      await options?.onStreamEvent?.(event)
    }
    const stopped = () => failed
    const enqueue = (consume: () => Promise<void>) => {
      if (settled || stepsSettled || failed)
        return Promise.resolve()
      eventQueue = eventQueue.then(() => {
        if (!failed)
          return consume()
      })
      void eventQueue.catch(rejectOnce)
      // The owned queue observes consumer failures. Do not leak its rejection into an unawaited SDK callback.
      return Promise.resolve()
    }
    const onEvent = (event: StreamEvent) => enqueue(() => guard.consume(event, emit, stopped))
    const onStepBoundary = () => enqueue(() => guard.inspect(false, emit, stopped))
    const notifyNativeToolCall = () => {
      if (settled || stepsSettled || failed)
        return
      // Tool execution can begin before queued output inspection. Block replay at event admission.
      try {
        onNativeToolCall?.()
      }
      catch (error) {
        rejectOnce(error)
      }
    }

    try {
      const streamResult = request.protocol === 'responses'
        ? streamResponses({ config: request.config, webSearch: supportedTools && request.webSearch, conversation, scope, options, tools, initialStep, onEvent, onStepBoundary, onNativeToolCall: notifyNativeToolCall, onToolsResolved: tools => guard.addTools(tools) })
        : streamChatCompletions({ config: request.config, conversation, scope, options, tools, initialStep, onEvent, onStepBoundary, onNativeToolCall: notifyNativeToolCall, onToolsResolved: tools => guard.addTools(tools), supportsContentArray: contentArraySupported })

      // NOTICE:
      // `steps` settles after all tool rounds, while provider finish events can arrive earlier.
      // Await it and consume other SDK promises to prevent stalled evals and unhandled rejections.
      // Source: @xsai/stream-text 0.5 steps and AIRI eval runners.
      // Remove this path when xsAI emits one terminal event after all tool rounds.
      void streamResult.steps.then(async () => {
        const acceptedEvents = eventQueue
        // Ignore new provider events. Accepted errors remain authoritative even after steps resolve.
        stepsSettled = true
        try {
          await acceptedEvents
          if (failed)
            return
          await guard.inspect(true, emit, stopped)
          const generatedTurn = await streamResult.generatedTurn
          await options?.onStreamEvent?.({ type: 'finish' })
          if (options?.abortSignal?.aborted)
            throw options.abortSignal.reason
          await options?.onGeneratedTurn?.(generatedTurn)
        }
        catch (error) {
          // Terminal consumers and generated turn persistence belong to generation
          // completion. Their failures are not ignorable late provider events.
          rejectOnce(error)
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
        if (error instanceof RequestSwitch) {
          // A provider change continues this generation. Drain accepted events and retain its pending candidates.
          stepsSettled = true
          void eventQueue.then(() => {
            if (settled || failed)
              return
            settled = true
            reject(error)
          }).catch(rejectOnce)
          return
        }
        rejectOnce(error)
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

/**
 * Runs one request and repeats it while the provider reports temporary unavailability.
 *
 * Retrying is only safe while the consumer has seen no stream event. After the
 * first event, text may already be rendered or spoken and tools may already have
 * run, so a repeat would duplicate them; those failures surface for manual Retry.
 * Cancelling through `abortSignal` also ends a pending retry wait.
 */
async function streamWithTransientRetry(input: StreamFromOptions, guard: ToolCallGuard) {
  for (let attempt = 0; ; attempt++) {
    let consumerNotified = false
    const checkpoint = guard.checkpoint()
    try {
      return await streamOnce({
        ...input,
        onNativeToolCall: () => {
          consumerNotified = true
          input.onNativeToolCall?.()
        },
        options: {
          ...input.options,
          onStreamEvent: (event) => {
            consumerNotified = true
            return input.options?.onStreamEvent?.(event)
          },
        },
      }, guard)
    }
    catch (error) {
      const delayMs = consumerNotified ? undefined : transientRetryDelayMs(error, attempt)
      if (delayMs == null)
        throw error
      guard.restore(checkpoint)
      console.warn(`[llm] Retrying provider request in ${delayMs}ms (retry ${attempt + 1}/${transientRetry.backoffMs.length}):`, error)
      await waitBeforeRetry(delayMs, input.options?.abortSignal)
    }
  }
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
  const guard = new ToolCallGuard(input.toolCallGuardNames)
  if (!input.options?.resolveStep)
    return streamWithTransientRetry(input, guard)

  const completedRounds: GenerationRound[] = []
  let turnId = input.options.requestCorrelation?.turnId
  let request = input
  let switches = 0
  while (true) {
    let finalTurn: AssistantTurn | undefined
    let lastUsage: Parameters<NonNullable<StreamOptions['onUsage']>>[0] | undefined
    try {
      await streamWithTransientRetry({
        ...request,
        options: {
          ...request.options,
          generationTurnId: turnId,
          generationRoundOffset: completedRounds.length,
          onGeneratedTurn: (turn) => { finalTurn = turn },
          onUsage: (usage) => { lastUsage = usage },
        },
      }, guard)
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
// An error about one tool is not in this list. An invalid schema or a failed tool call
// (`invalid_function_parameters`, `tool_use_failed`) does not show that the model has no tool support.
const TOOLS_RELATED_ERROR_PATTERNS: RegExp[] = [
  /does not support tools/i, // Ollama
  /no endpoints found that support tool use/i, // OpenRouter
  /functions are not supported/i, // Azure AI Foundry
  /unrecognized request argument.+tools/i, // Azure AI Foundry
  /tool use with function calling is unsupported/i, // Google Generative AI
  /does not support function.?calling/i, // Anthropic
  /tools?\s+(is|are)\s+not\s+supported/i, // Cloudflare Workers AI
]

export function isToolRelatedError(error: unknown): boolean {
  if (isPlainTextToolCallError(error))
    return true
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
