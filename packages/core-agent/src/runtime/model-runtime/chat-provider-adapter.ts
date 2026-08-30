import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { ModelRuntimePort } from '../../contracts/model-runtime-port'
import type { StreamOptions } from '../../types/llm'

import { streamFrom } from '../llm-service'
import { toModelConnectionError } from './errors'

/**
 * Adapts an existing xsAI `ChatProvider` onto {@link ModelRuntimePort}.
 *
 * The adapter keeps the current `streamFrom` call chain. It does not send
 * Custom Model transport requests and does not switch protocol.
 */
export function createChatProviderRuntime(chatProvider: ChatProvider): ModelRuntimePort {
  return {
    protocol: 'openai-chat-completions',
    async stream(input) {
      await streamFrom({
        model: input.model,
        chatProvider,
        messages: input.messages,
        options: withResolvedTools(input.options, input.tools),
      })
    },
    async discover() {
      return { status: 'unsupported' }
    },
    async validateGeneration(input) {
      try {
        await streamFrom({
          model: input.model,
          chatProvider,
          messages: [{ role: 'user', content: 'ping' }],
          options: {
            abortSignal: input.abortSignal,
            supportsTools: false,
          },
        })
        return { success: true }
      }
      catch (error) {
        return {
          success: false,
          error: toModelConnectionError(error, 'generation').toJSON(),
        }
      }
    },
  }
}

function withResolvedTools(options: StreamOptions | undefined, extraTools: StreamOptions['tools']): StreamOptions | undefined {
  if (!extraTools)
    return options
  if (!options)
    return { tools: extraTools }

  const originalTools = options.tools
  return {
    ...options,
    tools: async () => {
      const extra = typeof extraTools === 'function' ? await extraTools() : extraTools
      const original = typeof originalTools === 'function' ? await originalTools() : originalTools
      return [...(extra ?? []), ...(original ?? [])]
    },
  }
}
