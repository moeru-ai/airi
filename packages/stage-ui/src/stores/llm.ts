import type { StreamOptions } from '@proj-airi/core-agent'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isToolRelatedError, modelKey } from '@proj-airi/core-agent'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { resolveLlmTools } from './llm-tool-resolver'

export type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
export { isContentArrayRelatedError, isToolRelatedError } from '@proj-airi/core-agent'

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = modelKey(model, chatProvider)
    const { tools: customTools, ...streamOptions } = options ?? {}
    const builtinToolsResolver = () => resolveLlmTools({ customTools })

    const runStream = () => coreStreamFrom({
      model,
      chatProvider,
      messages,
      options: {
        ...streamOptions,
        toolsCompatibility: toolsCompatibility.value,
        contentArrayCompatibility: contentArrayCompatibility.value,
      },
      builtinToolsResolver,
    })

    try {
      await runStream()
    }
    catch (err) {
      if (isToolRelatedError(err)) {
        console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error`)
        toolsCompatibility.value.set(key, false)
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
