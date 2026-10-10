import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider, GenerationRequest } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import type { DescribeToolImage } from './tool-images'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isPlainTextToolCallError, isToolRelatedError, modelKey } from '@proj-airi/core-agent'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { resolveLlmTools, toolNameFrom } from './tool-resolver'

export type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
export { isContentArrayRelatedError, isPlainTextToolCallError, isToolRelatedError } from '@proj-airi/core-agent'

/** Core stream options plus the stage-ui reader of images in tool results. */
export interface LlmStreamOptions extends StreamOptions {
  /** Reads the images in tool results as text. See {@link resolveLlmTools}. */
  describeToolImage?: DescribeToolImage
}

function toolChoiceRequiresTools(choice: StreamOptions['toolChoice']): boolean {
  if (choice === 'required')
    return true
  if (typeof choice !== 'object' || choice === null)
    return false
  return choice.type === 'function' || (choice.type === 'allowed_tools' && choice.mode === 'required')
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())

  async function stream(model: string, chatProvider: GenerationProvider, context: Conversation, options?: LlmStreamOptions) {
    const { tools: customTools, describeToolImage, ...streamOptions } = options ?? {}
    const initialRequest = chatProvider.generation(model)
    let key = modelKey(model, initialRequest)
    let toolsDisabled = false
    let arraysDisabled = false
    let hasCommittedAttemptOutput = false
    const toolCallGuardNames = new Set<string>()
    const rememberTools = (tools?: Tool[]) => {
      for (const tool of tools ?? []) {
        const name = toolNameFrom(tool)
        if (name)
          toolCallGuardNames.add(name)
      }
    }
    const builtinToolsResolver = async () => {
      const tools = await resolveLlmTools({ customTools, describeImage: describeToolImage })
      rememberTools(tools)
      return tools
    }

    // The cache follows the actual request selection. Retry flags only remove capabilities for this generation.
    const requestToolsSupported = (model: string, request: GenerationRequest) => {
      if (toolsDisabled || streamOptions.supportsTools === false)
        return false
      return toolChoiceRequiresTools(streamOptions.toolChoice)
        || (streamOptions.supportsTools ?? (toolsCompatibility.value.get(modelKey(model, request)) !== false))
    }
    const requestArraysSupported = (model: string, request: GenerationRequest) => !arraysDisabled
      && (streamOptions.supportsContentArray ?? (contentArrayCompatibility.value.get(modelKey(model, request)) !== false))
    let supportsTools = requestToolsSupported(model, initialRequest)
    let supportsContentArray = requestArraysSupported(model, initialRequest)

    // A cached downgrade still needs current tool names. An explicit tool-free request never resolves builtin tools.
    if (!supportsTools && streamOptions.supportsTools !== false && !streamOptions.resolveStep)
      await builtinToolsResolver()
    const resolveStep = streamOptions.resolveStep
      ? async () => {
        const next = await streamOptions.resolveStep!()
        const request = next.chatProvider.generation(next.model)
        key = modelKey(next.model, request)
        supportsTools = requestToolsSupported(next.model, request)
        supportsContentArray = requestArraysSupported(next.model, request)
        if (streamOptions.supportsTools !== false)
          rememberTools(next.tools)
        return next
      }
      : undefined

    const runStream = () => coreStreamFrom({
      model,
      chatProvider,
      conversation: context,
      options: {
        ...streamOptions,
        resolveStep,
        supportsTools: toolsDisabled ? false : streamOptions.supportsTools,
        supportsContentArray: arraysDisabled ? false : streamOptions.supportsContentArray,
        onStreamEvent: async (event) => {
          if (event.type !== 'error')
            hasCommittedAttemptOutput = true
          await streamOptions.onStreamEvent?.(event)
        },
        onGeneratedTurn: async (turn) => {
          hasCommittedAttemptOutput = true
          await streamOptions.onGeneratedTurn?.(turn)
        },
        toolsCompatibility: toolsCompatibility.value,
        contentArrayCompatibility: contentArrayCompatibility.value,
      },
      builtinToolsResolver,
      toolCallGuardNames,
      onNativeToolCall: () => { hasCommittedAttemptOutput = true },
    })

    // Each retry removes one capability. The generation makes at most three attempts.
    while (true) {
      try {
        await runStream()
        return
      }
      catch (err) {
        const retryWithoutTools = isPlainTextToolCallError(err)
          && supportsTools
          && !hasCommittedAttemptOutput
          && !toolChoiceRequiresTools(streamOptions.toolChoice)
        if (isToolRelatedError(err)) {
          const retryMessage = retryWithoutTools ? ' and retrying once' : ''
          console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error${retryMessage}`)
          toolsCompatibility.value.set(key, false)
        }
        const retryWithoutArrays = isContentArrayRelatedError(err)
          && supportsContentArray
          && streamOptions.supportsContentArray !== true
          && !hasCommittedAttemptOutput
        if (isContentArrayRelatedError(err)) {
          const retryMessage = retryWithoutArrays ? ' and retrying once' : ''
          console.warn(`[llm] Auto-disabling content-part arrays for "${key}"${retryMessage}`)
          contentArrayCompatibility.value.set(key, false)
        }
        if (retryWithoutTools) {
          toolsDisabled = true
          supportsTools = false
          continue
        }
        // Issue #1500: Keep the same classifier for both fallback orders.
        if (retryWithoutArrays) {
          arraysDisabled = true
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
