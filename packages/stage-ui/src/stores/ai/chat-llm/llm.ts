import type { Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { DescribeToolImage } from './tool-images'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isToolRelatedError, modelKey, STAY_QUIET_TOOL_NAME, STAY_QUIET_TOOLSET_PROMPT } from '@proj-airi/core-agent'
import { SPARK_COMMAND_TOOLSET_PROMPT } from '@proj-airi/core-agent/agents/spark-command'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { CONTEXT_SOURCE_TOOL_NAME, CONTEXT_SOURCE_TOOLSET_PROMPT } from '../../../tools/context-source'
import { useModelProfilesStore } from '../../modules/model-profiles'
import { resolveLlmTools, toolNameFrom } from './tool-resolver'
import { useLlmToolsetPromptsStore } from './toolset-prompts'

export type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
export { isContentArrayRelatedError, isToolRelatedError } from '@proj-airi/core-agent'

/** Core stream options plus the stage-ui reader of images in tool results. */
export interface LlmStreamOptions extends StreamOptions {
  /** Reads the images in tool results as text. See {@link resolveLlmTools}. */
  describeToolImage?: DescribeToolImage
}

export const useLLM = defineStore('llm', () => {
  const toolsetPrompts = useLlmToolsetPromptsStore()
  const modelProfiles = useModelProfilesStore()
  toolsetPrompts.registerToolsetPrompts('spark-command', [{
    id: 'spark-command',
    title: 'Command relay',
    requiredTools: ['builtIn_emitSparkCommand'],
    content: SPARK_COMMAND_TOOLSET_PROMPT,
  }])
  toolsetPrompts.registerToolsetPrompts('stay-quiet', [{
    id: 'stay-quiet',
    title: 'Silence',
    requiredTools: [STAY_QUIET_TOOL_NAME],
    content: STAY_QUIET_TOOLSET_PROMPT,
  }])
  toolsetPrompts.registerToolsetPrompts('context-source', [{
    id: 'context-source',
    title: 'Observation details',
    requiredTools: [CONTEXT_SOURCE_TOOL_NAME],
    content: CONTEXT_SOURCE_TOOLSET_PROMPT,
  }])
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())

  async function stream(model: string, chatProvider: GenerationProvider, context: Conversation, options?: LlmStreamOptions) {
    const key = modelKey(model, chatProvider.generation(model))
    let toolExecutionStarted = false
    const startedAt = performance.now()
    let firstTokenSeen = false
    const { tools: customTools, describeToolImage, ...streamOptions } = options ?? {}
    const builtinToolsResolver = () => resolveLlmTools({ customTools, describeImage: describeToolImage, runId: streamOptions.requestCorrelation?.runId })

    const runStream = () => coreStreamFrom({
      model,
      chatProvider,
      conversation: context,
      options: {
        ...streamOptions,
        resolveToolsetPrompt: (tools) => {
          const names = tools.map(toolNameFrom).filter((name): name is string => name !== undefined)
          const registered = toolsetPrompts.getToolsetPromptForTools(names)
          const requestOwned = streamOptions.resolveToolsetPrompt?.(tools).trim()
          return [registered, requestOwned].filter(Boolean).join('\n\n')
        },
        onStreamEvent: async (event) => {
          if (event.type === 'tool-call')
            toolExecutionStarted = true
          // The first text or tool call measures the model's first-token delay for its profile.
          if (!firstTokenSeen && streamOptions.providerId && (event.type === 'text-delta' || event.type === 'tool-call')) {
            firstTokenSeen = true
            modelProfiles.observeFirstToken(streamOptions.providerId, model, performance.now() - startedAt)
          }
          await streamOptions.onStreamEvent?.(event)
        },
        // Every request counts toward the optional spending limit, including notifications and the classifier.
        onUsage: async (usage) => {
          if (streamOptions.providerId)
            modelProfiles.recordUsage(streamOptions.providerId, model, usage, streamOptions.requestCorrelation?.runId)
          await streamOptions.onUsage?.(usage)
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
