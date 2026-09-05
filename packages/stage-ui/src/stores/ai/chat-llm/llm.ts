import type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isPlainTextToolCallError, isToolRelatedError, modelKey } from '@proj-airi/core-agent'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { resolveLlmTools } from './tool-resolver'

export type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
export { isContentArrayRelatedError, isPlainTextToolCallError, isToolRelatedError } from '@proj-airi/core-agent'

function toolChoiceRequiresTools(toolChoice: StreamOptions['toolChoice']): boolean {
  if (toolChoice === 'required')
    return true
  if (typeof toolChoice !== 'object' || toolChoice === null)
    return false

  return toolChoice.type === 'function'
    || (toolChoice.type === 'allowed_tools' && toolChoice.mode === 'required')
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = modelKey(model, chatProvider)
    const { tools: customTools, ...streamOptions } = options ?? {}
    const builtinToolsResolver = () => resolveLlmTools({ customTools })
    let hasCommittedAttemptOutput = false

    const runStream = () => coreStreamFrom({
      model,
      chatProvider,
      messages,
      options: {
        ...streamOptions,
        toolsCompatibility: toolsCompatibility.value,
        contentArrayCompatibility: contentArrayCompatibility.value,
        onStreamEvent: async (event: StreamEvent) => {
          if (event.type !== 'error' && event.type !== 'finish')
            hasCommittedAttemptOutput = true
          await streamOptions.onStreamEvent?.(event)
        },
      },
      builtinToolsResolver,
    })

    try {
      await runStream()
    }
    catch (err) {
      const shouldRetryWithoutTools = isPlainTextToolCallError(err)
        && !hasCommittedAttemptOutput
        && !toolChoiceRequiresTools(streamOptions.toolChoice)
      if (isToolRelatedError(err)) {
        const retryMessage = shouldRetryWithoutTools ? ' and retrying once' : ''
        console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error${retryMessage}`)
        toolsCompatibility.value.set(key, false)
      }
      // The leak guard buffers this failure before any text reaches the UI, so
      // retrying cannot duplicate partial output from the failed attempt.
      if (shouldRetryWithoutTools) {
        await runStream()
        return
      }
      // NOTICE:
      // Auto-degrade content-part arrays to plain strings on the next attempt
      // when the provider returned the Rust/serde-style "expected a string"
      // 400. We retry once inline so the user's failing turn recovers without
      // requiring them to resend; subsequent calls reuse the cached degrade.
      // See: https://github.com/moeru-ai/airi/issues/1500
      if (isContentArrayRelatedError(err) && contentArrayCompatibility.value.get(key) !== false) {
        console.warn(`[llm] Auto-disabling content-part arrays for "${key}" and retrying once`)
        contentArrayCompatibility.value.set(key, false)
        await runStream()
        return
      }
      throw err
    }
  }

  async function models(apiUrl: string, apiKey: string) {
    if (apiUrl === '')
      return []

    try {
      return await listModels({
        baseURL: (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) as `${string}/`,
        apiKey,
      })
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`))
        return []
      throw err
    }
  }

  return {
    models,
    stream,
  }
})
