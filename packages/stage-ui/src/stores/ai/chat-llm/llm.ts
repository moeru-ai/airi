import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isToolRelatedError, modelKey } from '@proj-airi/core-agent'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { resolveLlmTools } from './tool-resolver'

export type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
export { isContentArrayRelatedError, isToolRelatedError } from '@proj-airi/core-agent'

interface LlmStreamOptions extends StreamOptions {
  prepareStringContent?: (conversation: Conversation) => Promise<Conversation>
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())

  async function stream(model: string, chatProvider: GenerationProvider, context: Conversation, options?: LlmStreamOptions) {
    let key = modelKey(model, chatProvider.generation(model))
    let toolExecutionStarted = false
    const { tools: customTools, prepareStringContent, ...streamOptions } = options ?? {}
    const resolveStep = streamOptions.resolveStep
    const builtinToolsResolver = () => resolveLlmTools({ customTools, cardId: options?.cardId })

    const runStream = async () => coreStreamFrom({
      model,
      chatProvider,
      conversation: context,
      options: {
        ...streamOptions,
        resolveStep: resolveStep
          ? async () => ({
            ...await resolveStep(),
            tools: await resolveLlmTools({ customTools, cardId: options?.cardId }),
          })
          : undefined,
        prepareConversation: async (source, request, providerId) => {
          key = modelKey(request.config.model, request)
          const prepared = await streamOptions.prepareConversation?.(source, request, providerId) ?? source
          return contentArrayCompatibility.value.get(key) === false && prepareStringContent
            ? prepareStringContent(prepared)
            : prepared
        },
        onStreamEvent: async (event) => {
          if (event.type === 'tool-call')
            toolExecutionStarted = true
          await streamOptions.onStreamEvent?.(event)
        },
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
        // A completed tool can have external effects. A full retry must not repeat it.
        if (toolExecutionStarted)
          throw err
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
