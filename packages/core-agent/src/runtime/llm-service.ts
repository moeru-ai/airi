import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { StreamFromOptions, StreamOptions } from '../types/llm'

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

export function streamOptionsToolsCompatibilityOk(model: string, chatProvider: ChatProvider, options?: StreamOptions): boolean {
  if (options?.supportsTools)
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
  if (options?.supportsContentArray)
    return true
  const key = modelKey(model, chatProvider)
  return options?.contentArrayCompatibility?.get(key) !== false
}

async function resolveTools(options?: StreamOptions) {
  const tools = typeof options?.tools === 'function'
    ? await options.tools()
    : options?.tools
  return tools ?? []
}

export async function streamFrom({
  model,
  chatProvider,
  messages,
  options,
  builtinToolsResolver,
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

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }
    const rejectOnce = (error: unknown) => {
      if (settled)
        return
      settled = true
      reject(error)
    }

    const onEvent = async (event: unknown) => {
      try {
        await options?.onStreamEvent?.(event as any)
        if (event && (event as any).type === 'finish') {
          const finishReason = (event as any).finishReason
          const waitingForToolRound = finishReason === 'tool_calls' || finishReason === 'tool-calls'
          if (!waitingForToolRound || !options?.waitForTools)
            resolveOnce()
        }
        else if (event && (event as any).type === 'error') {
          rejectOnce((event as any).error ?? new Error('Stream error'))
        }
      }
      catch (error) {
        rejectOnce(error)
      }
    }

    try {
      const streamResult = streamText({
        ...chatConfig,
        abortSignal: options?.abortSignal,
        messages: sanitized,
        headers: options?.headers,
        stopWhen: stepCountAtLeast(10),
        tools,
        // NOTICE: Some OpenAI-compatible gateways reject the wire-level
        // `capture_tool_errors` parameter with 400 unknown_parameter.
        // Keep this unset here so the request remains provider-compatible.
        onEvent,
      })

      // NOTICE: Consume underlying promises to prevent unhandled rejections from
      // @xsai/stream-text's SSE parser surfacing as faulted app state.
      void streamResult.steps.catch((error) => {
        rejectOnce(error)
        console.error('Stream steps error:', error)
      })
      void streamResult.messages.catch(error => console.error('Stream messages error:', error))
      void streamResult.usage.catch(error => console.error('Stream usage error:', error))
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
