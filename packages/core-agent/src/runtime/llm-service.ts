import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { StreamFromOptions, StreamOptions } from '../types/llm'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

export function sanitizeMessages(messages: unknown[]): Message[] {
  return messages.map((message: any) => {
    if (message && message.role === 'error') {
      return {
        role: 'user',
        content: `User encountered error: ${String(message.content ?? '')}`,
      } as Message
    }

    // NOTICE: Flatten array content for providers (e.g. DeepSeek) that expect string,
    // not content-part arrays. Skipped when image_url parts are present.
    if (message && Array.isArray(message.content)) {
      const contentParts = message.content as { type?: string, text?: string }[]
      if (!contentParts.some(part => part?.type === 'image_url')) {
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
  const sanitized = sanitizeMessages(messages as unknown[])

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
