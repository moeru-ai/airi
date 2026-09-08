import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isPlainTextToolCallError, isToolRelatedError, modelKey, streamOptionsContentArrayCompatibilityOk, streamOptionsToolsCompatibilityOk } from '@proj-airi/core-agent'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { resolveLlmTools, toolNameFrom } from './tool-resolver'

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

/** Core stream options plus the stage-ui reader of images in tool results. */
export interface LlmStreamOptions extends StreamOptions {
  /** Reads the images in tool results as text. See {@link resolveLlmTools}. */
  describeToolImage?: DescribeToolImage
  /**
   * The only tools of a task beside the chat, for example the icon search of a tool card. The request gets them in
   * place of the tools of the chat, and without the tools of the provider, so a task runs nothing else.
   */
  taskTools?: Tool[]
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())

  async function stream(model: string, chatProvider: GenerationProvider, context: Conversation, options?: LlmStreamOptions) {
    // Compatibility belongs to the model that received the failing request.
    // `prepareConversation` runs for every resolved request, so the key follows a step that changes the model.
    let key = modelKey(model, chatProvider.generation(model))
    let toolExecutionStarted = false
    const { tools: customTools, describeToolImage, taskTools, ...streamOptions } = options ?? {}
    const resolveTools = async () => taskTools ?? await resolveLlmTools({ customTools, describeImage: describeToolImage })
    const resolveStep = streamOptions.resolveStep
    // Keep names for this request's retries even after the capability cache
    // disables tool resolution. Do not carry these names into another request.
    const toolCallGuardNames = new Set<string>()
    const builtinToolsResolver = async () => {
      const tools = await resolveTools()
      for (const tool of tools) {
        const name = toolNameFrom(tool)
        if (name)
          toolCallGuardNames.add(name)
      }
      return tools
    }
    // Cache-disabled requests still need detection, but explicitly tool-free
    // requests must not resolve tools or inherit names from other requests.
    if (!startsWithTools && streamOptions.supportsTools !== false)
      await builtinToolsResolver()
    let hasCommittedAttemptOutput = false
    let supportsTools = startsWithTools
    let supportsContentArray = streamOptionsContentArrayCompatibilityOk(model, chatProvider, {
      ...streamOptions,
      contentArrayCompatibility: contentArrayCompatibility.value,
    })

    const runStream = () => coreStreamFrom({
      model,
      chatProvider,
      conversation: context,
      options: {
        ...streamOptions,
        ...(taskTools ? { providerTools: false } : {}),
        // Core uses only the tools of a resolved step, so each step carries the complete tool list.
        resolveStep: resolveStep
          ? async () => ({ ...await resolveStep(), tools: await resolveTools() })
          : undefined,
        prepareConversation: async (conversation, target) => {
          key = modelKey(target.model, target.request)
          return await streamOptions.prepareConversation?.(conversation, target) ?? conversation
        },
        onStreamEvent: async (event) => {
          if (event.type === 'tool-call')
            toolExecutionStarted = true
          await streamOptions.onStreamEvent?.(event)
        },
        toolsCompatibility: toolsCompatibility.value,
        contentArrayCompatibility: contentArrayCompatibility.value,
        supportsTools,
        supportsContentArray,
        onStreamEvent: async (event: StreamEvent) => {
          if (event.type !== 'error')
            hasCommittedAttemptOutput = true
          await streamOptions.onStreamEvent?.(event)
        },
        onMessages: async (finalMessages) => {
          hasCommittedAttemptOutput = true
          await streamOptions.onMessages?.(finalMessages)
        },
      },
      builtinToolsResolver,
      toolCallGuardNames,
      onNativeToolCall: () => { hasCommittedAttemptOutput = true },
    })

    // Each retry disables one remaining capability. Neither capability returns
    // during this request, so there are at most three stream attempts.
    while (true) {
      try {
        await runStream()
        return
      }
      catch (err) {
        const shouldRetryWithoutTools = isPlainTextToolCallError(err)
          && supportsTools
          && !hasCommittedAttemptOutput
          && !toolChoiceRequiresTools(streamOptions.toolChoice)
        if (isToolRelatedError(err)) {
          const retryMessage = shouldRetryWithoutTools ? ' and retrying once' : ''
          console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error${retryMessage}`)
          toolsCompatibility.value.set(key, false)
        }
        // Keep explicit array support intact. Its request-level override takes
        // precedence over the cache, so the same payload cannot recover inline.
        const shouldRetryWithoutArrays = isContentArrayRelatedError(err)
          && supportsContentArray
          && streamOptions.supportsContentArray !== true
          && !hasCommittedAttemptOutput
        if (isContentArrayRelatedError(err)) {
          const retryMessage = shouldRetryWithoutArrays ? ' and retrying once' : ''
          console.warn(`[llm] Auto-disabling content-part arrays for "${key}"${retryMessage}`)
          contentArrayCompatibility.value.set(key, false)
        }
        if (shouldRetryWithoutTools) {
          supportsTools = false
          continue
        }
        // Issue #1500: string-only providers reject content-part arrays.
        // Retry errors return to this classifier so both fallbacks can apply.
        if (shouldRetryWithoutArrays) {
          supportsContentArray = false
          continue
        }
        throw err
      }
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
