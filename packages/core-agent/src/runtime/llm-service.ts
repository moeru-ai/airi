import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Event, Message, Usage } from '@xsai/shared-chat'

import type { StreamEvent, StreamFromOptions, StreamOptions } from '../types/llm'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

/**
 * Normalize chat messages so they match the wire format the active provider
 * actually accepts, flattening content-part arrays back to plain strings when
 * the provider can't deserialize arrays.
 *
 * Use when:
 * - Composing the final message list right before handing it to the OpenAI-
 *   compatible chat SDK.
 *
 * Expects:
 * - `role: 'error'` entries (AIRI-internal markers from the chat UI). They are
 *   rewritten as user-role narrations so the provider doesn't reject them.
 * - `content` may be a string, a content-part array, or undefined.
 *
 * Returns:
 * - A new array of `Message` values; original objects are not mutated.
 *
 * @param messages - Raw messages from the chat session, may include AIRI's
 *   `error` role.
 * @param supportsContentArray - When `false`, force-flatten every array
 *   content (including text + `image_url` mixes) to a text-only string and
 *   drop non-text parts. Drives the runtime auto-degrade for strict providers.
 *   Defaults to `true` to preserve vision/multimodal payloads on capable
 *   providers.
 */
export function sanitizeMessages(messages: unknown[], supportsContentArray: boolean = true): Message[] {
  return messages.map((message: any) => {
    if (message && message.role === 'error') {
      return {
        role: 'user',
        content: `User encountered error: ${String(message.content ?? '')}`,
      } as Message
    }

    // NOTICE:
    // Flatten array content for providers (e.g. DeepSeek and other Rust/serde-
    // strict OpenAI-compatible gateways) that only accept `messages[].content`
    // as a plain string and reject arrays with `Failed to deserialize the JSON
    // body into the target type: messages[N]: invalid type: sequence, expected
    // a string`.
    // Root cause: OpenAI's chat API permits `content` as either `string` or an
    // array of content parts; some compatible servers only implement the
    // string variant.
    // Source/context: https://github.com/moeru-ai/airi/issues/1500
    // Removal condition: when every supported provider accepts content-part
    // arrays uniformly (no longer realistic for the OpenAI-compatible
    // ecosystem, so this is effectively load-bearing).
    if (message && Array.isArray(message.content)) {
      const contentParts = message.content as { type?: string, text?: string }[]
      const hasNonTextPart = contentParts.some(part => part?.type && part.type !== 'text')
      // When the provider supports arrays, only flatten pure-text arrays so we
      // never silently drop image / audio / file parts on a vision-capable
      // model. When it doesn't, flatten unconditionally; non-text parts are
      // dropped because the provider can't carry them anyway.
      if (!supportsContentArray || !hasNonTextPart) {
        return { ...message, content: contentParts.map(part => part?.text ?? '').join('') } as Message
      }
    }

    return message as Message
  })
}

export function modelKey(model: string, chatProvider: ChatProvider): string {
  return `${chatProvider.chat(model).baseURL}-${model}`
}

function toolChoiceRequiresTools(toolChoice: StreamOptions['toolChoice']): boolean {
  if (toolChoice === 'required')
    return true
  if (typeof toolChoice !== 'object' || toolChoice === null)
    return false

  return toolChoice.type === 'function'
    || (toolChoice.type === 'allowed_tools' && toolChoice.mode === 'required')
}

/**
 * Resolve whether tools may be attached to the provider request.
 *
 * An explicit `supportsTools: false` always wins. A required tool choice takes
 * precedence over the runtime incompatibility cache so a mandatory tool call
 * is retried with its tools instead of being silently downgraded to text.
 */
export function streamOptionsToolsCompatibilityOk(model: string, chatProvider: ChatProvider, options?: StreamOptions): boolean {
  if (options?.supportsTools === false)
    return false
  if (toolChoiceRequiresTools(options?.toolChoice))
    return true
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
export function streamOptionsContentArrayCompatibilityOk(model: string, chatProvider: ChatProvider, options?: StreamOptions): boolean {
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

const PLAIN_TEXT_TOOL_CALL_ERROR_CODE = 'AIRI_PLAIN_TEXT_TOOL_CALL'

type BufferedOutputEvent
  = | { type: 'text-delta', text: string }
    | { type: 'reasoning-delta', text: string }

type BufferedToolEvent = Extract<Event, { type: 'tool-call.done' | 'tool-result.done' }>

function plainTextToolCallError(toolName: string): Error {
  return Object.assign(
    new Error(`Model returned tool call "${toolName}" as plain text instead of native tool calling.`),
    { code: PLAIN_TEXT_TOOL_CALL_ERROR_CODE },
  )
}

function serializedToolCallName(parsed: unknown, toolNames: Set<string>): string | undefined {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return undefined

  const record = parsed as Record<string, unknown>
  if (typeof record.name !== 'string' || !toolNames.has(record.name))
    return undefined
  if (!Object.hasOwn(record, 'parameters') && !Object.hasOwn(record, 'arguments'))
    return undefined

  return record.name
}

function leakedToolCallName(text: string, toolNames: Set<string>): string | undefined {
  // Each opening brace needs its own boundary, independent of malformed prefixes.
  // Build suffix boundaries once instead of rescanning the rest of the channel
  // for every unmatched opening brace. -1 means that no closing boundary exists.
  const stringEnds = new Int32Array(text.length + 2).fill(-1)
  const objectEnds = new Int32Array(text.length + 2).fill(-1)
  for (let index = text.length - 1; index >= 0; index--) {
    const character = text[index]
    // Inside a string, a backslash consumes the next character, including a quote.
    stringEnds[index] = character === '"'
      ? index
      : stringEnds[index + (character === '\\' ? 2 : 1)]

    if (character === '}') {
      objectEnds[index] = index
    }
    else if (character === '"' || character === '{') {
      const end = character === '"' ? stringEnds[index + 1] : objectEnds[index + 1]
      // Outside strings, skip a complete string or nested object to find the
      // closing brace for the enclosing object.
      objectEnds[index] = end < 0 ? -1 : objectEnds[end + 1]
    }
    else {
      objectEnds[index] = objectEnds[index + 1]
    }
  }

  // Allow eight full-channel passes for recovery from malformed prefixes.
  // A valid object needs one pass, with no extra size or depth limit.
  let remainingParseWork = text.length * 8
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    const end = objectEnds[start + 1]
    if (end < 0)
      continue

    // Charge overlapping spans before slicing or parsing them. On exhaustion,
    // reject the step so unchecked buffered output cannot reach consumers.
    const candidateLength = end - start + 1
    if (candidateLength > remainingParseWork)
      throw new Error('Model output exceeded the JSON inspection work limit.')
    remainingParseWork -= candidateLength

    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1))
      const toolName = serializedToolCallName(parsed, toolNames)
      if (toolName)
        return toolName
      // A valid ordinary object owns its children and quoted examples.
      // Only malformed candidates permit recovery at a later opening brace.
      start = end
    }
    catch {
      continue
    }
  }
  return undefined
}

function toolNameFrom(tool: unknown): string | undefined {
  if (typeof tool !== 'object' || tool === null)
    return undefined

  const candidate = tool as {
    name?: string
    function?: { name?: string }
  }
  return candidate.function?.name ?? candidate.name
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

/**
 * Forwards provider events in order and completes after the accepted callbacks.
 * On failure, pending output stops before this promise rejects. An active callback
 * must settle first because the runtime cannot cancel consumer side effects.
 * Events received after provider completion do not enter the queue.
 */
export async function streamFrom({
  model,
  chatProvider,
  messages,
  options,
  builtinToolsResolver,
  toolCallGuardNames,
  onNativeToolCall,
}: StreamFromOptions) {
  const chatConfig = chatProvider.chat(model)
  const supportsContentArray = streamOptionsContentArrayCompatibilityOk(model, chatProvider, options)
  const sanitized = sanitizeMessages(messages as unknown[], supportsContentArray)

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, options)
  const builtinTools = supportedTools
    ? await (builtinToolsResolver?.(model, chatProvider) ?? Promise.resolve([]))
    : []
  const customTools = supportedTools ? await resolveTools(options) : []
  const mergedTools = supportedTools ? [...builtinTools, ...customTools] : []
  const tools = mergedTools.length > 0 ? mergedTools : undefined
  if (!tools && toolChoiceRequiresTools(options?.toolChoice))
    throw new Error('Cannot satisfy a required tool choice because no tools are available for this request.')
  const toolNames = new Set(toolCallGuardNames)
  for (const tool of mergedTools) {
    const name = toolNameFrom(tool)
    if (name)
      toolNames.add(name)
  }

  return new Promise<void>((resolve, reject) => {
    // Provider completion closes admission, but accepted events can still fail.
    // Failure stops queued work. Settlement waits for the active callback so
    // consumers cannot receive a rejection while that callback still changes state.
    let settled = false
    let stepsSettled = false
    let failed = false
    let eventQueue = Promise.resolve()
    let bufferPossibleToolCall = toolNames.size > 0
    let bufferedOutputEvents: (BufferedOutputEvent | BufferedToolEvent)[] = []
    let bufferedReasoningText = ''
    let bufferedText = ''
    // The guard stays active until step completion, even after native tool events.
    // After either channel starts a JSON candidate, preserve all output order
    // until the complete objects can be checked at the end of the step.
    let hasBufferedJsonCandidate = false
    const resolveOnce = () => {
      if (settled || failed)
        return
      settled = true
      resolve()
    }
    const emitOutputEvent = async (event: BufferedOutputEvent) => {
      if (event.text)
        await options?.onStreamEvent?.(event)
    }

    const bufferOutputEvent = (event: BufferedOutputEvent) => {
      hasBufferedJsonCandidate ||= event.text.includes('{')
      const previous = bufferedOutputEvents.at(-1)
      if (previous?.type === event.type)
        previous.text += event.text
      else
        bufferedOutputEvents.push(event)
    }

    const takeBufferedOutput = () => {
      const events = bufferedOutputEvents
      bufferedOutputEvents = []
      bufferedReasoningText = ''
      bufferedText = ''
      hasBufferedJsonCandidate = false
      return events
    }

    const rejectOnce = (error: unknown) => {
      if (settled || failed)
        return
      failed = true
      const rejectAfterEvents = () => {
        takeBufferedOutput()
        settled = true
        reject(error)
      }
      // Both queue outcomes retain the first failure. The queue can itself
      // reject, or finish after an active listener returns from a provider failure.
      void eventQueue.then(rejectAfterEvents, rejectAfterEvents)
    }

    const flushBufferedOutput = async () => {
      const events = takeBufferedOutput()
      for (const event of events) {
        if (failed)
          return
        if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
          await emitOutputEvent(event)
        }
        else {
          const streamEvent = toAiriStreamEvent(event)
          if (streamEvent != null)
            await options?.onStreamEvent?.(streamEvent)
        }
      }
    }

    const finishPossibleToolCall = async () => {
      if (!bufferPossibleToolCall)
        return

      bufferPossibleToolCall = false
      const toolName = leakedToolCallName(bufferedText, toolNames)
        ?? leakedToolCallName(bufferedReasoningText, toolNames)
      if (toolName) {
        takeBufferedOutput()
        throw plainTextToolCallError(toolName)
      }

      await flushBufferedOutput()
    }

    const startToolCallGuardStep = async () => {
      await finishPossibleToolCall()
      bufferPossibleToolCall = toolNames.size > 0
    }

    const consumeTextDelta = async (text: string) => {
      if (!bufferPossibleToolCall) {
        await emitOutputEvent({ type: 'text-delta', text })
        return
      }

      bufferOutputEvent({ type: 'text-delta', text })
      bufferedText += text
      // Stream plain text without disabling detection for later JSON. Once a
      // prefix reaches the caller, a later failure cannot safely replay it.
      if (!hasBufferedJsonCandidate && bufferedText.trim().length > 0)
        await flushBufferedOutput()
    }

    const consumeReasoningDelta = async (text: string) => {
      if (!bufferPossibleToolCall) {
        await emitOutputEvent({ type: 'reasoning-delta', text })
        return
      }

      bufferOutputEvent({ type: 'reasoning-delta', text })
      bufferedReasoningText += text
      if (!hasBufferedJsonCandidate && bufferedReasoningText.trim().length > 0)
        await flushBufferedOutput()
    }

    const processEvent = async (event: Event) => {
      if (event.type === 'step.start') {
        await startToolCallGuardStep()
        return
      }
      if (event.type === 'step.done') {
        await finishPossibleToolCall()
        return
      }
      if (event.type === 'text.delta') {
        await consumeTextDelta(event.delta)
        return
      }
      if (event.type === 'reasoning.delta') {
        await consumeReasoningDelta(event.delta)
        return
      }
      if (event.type === 'tool-call.done' || event.type === 'tool-result.done') {
        // Native events do not prove that other channels are safe. Keep their
        // UI notifications behind any candidate to preserve output order.
        if (bufferPossibleToolCall && bufferedOutputEvents.length > 0) {
          bufferedOutputEvents.push(event)
          return
        }
      }

      const streamEvent = toAiriStreamEvent(event)
      if (streamEvent != null)
        await options?.onStreamEvent?.(streamEvent)
      if (streamEvent?.type === 'error')
        throw streamEvent.error
    }

    // xsAI intentionally does not await onEvent. Keep our own chain so output
    // events retain provider order and completion waits for accepted deltas.
    const onEvent = (event: Event) => {
      if (settled || stepsSettled || failed)
        return

      if (event.type === 'tool-call.start' || event.type === 'tool-call.delta' || event.type === 'tool-call.done' || event.type === 'tool-result.done') {
        // xsAI does not await our queue before tool execution. Notify the retry
        // owner now, even if inspection later rejects buffered UI events.
        try {
          onNativeToolCall?.()
        }
        catch (error) {
          rejectOnce(error)
          return
        }
      }

      eventQueue = eventQueue.then(() => {
        if (!failed)
          return processEvent(event)
      })
      void eventQueue.catch(error => rejectOnce(error))
    }

    try {
      const streamResult = streamText({
        ...chatConfig,
        abortSignal: options?.abortSignal,
        messages: sanitized,
        headers: options?.headers,
        streamOptions: { includeUsage: true },
        temperature: options?.temperature,
        topP: options?.topP,
        stopWhen: stepCountAtLeast(10),
        tools,
        toolChoice: tools ? options?.toolChoice : undefined,
        onEvent,
      })

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
        const acceptedEvents = eventQueue
        // Reject new provider events, not errors already accepted into the queue.
        stepsSettled = true
        try {
          await acceptedEvents
          if (failed)
            return
          await finishPossibleToolCall()
        }
        catch (error) {
          rejectOnce(error)
          return
        }

        try {
          const finalMessages = await streamResult.messages
          await options?.onMessages?.(finalMessages)
        }
        catch (error) {
          // Transcript persistence is part of the completed response contract,
          // unlike late provider events and optional usage observation.
          rejectOnce(error)
          return
        }
        try {
          await options?.onStreamEvent?.({ type: 'finish' } as const)
        }
        catch (error) {
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
        rejectOnce(error)
        console.error('Stream steps error:', error)
      })
      // `steps` can reject before the success path awaits `messages`.
      // Keep this rejection sink so xsAI cannot create an unhandled rejection.
      void streamResult.messages.catch(error => console.error('Stream messages error:', error))
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
  if (isPlainTextToolCallError(error))
    return true

  const message = String(error)
  return TOOLS_RELATED_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

/**
 * Identify this module's sentinel for a plain-text call to a known tool.
 * Known names include tools from an earlier attempt of the same request.
 * Message text alone never matches.
 *
 * A `true` result does not make replay safe by itself. Callers must separately
 * verify that no output or tool side effects were committed and that the tool
 * choice does not require a tool before retrying without tools.
 */
export function isPlainTextToolCallError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === PLAIN_TEXT_TOOL_CALL_ERROR_CODE
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
