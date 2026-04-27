import type { StreamOptions } from '@proj-airi/core-agent'
import type { WebSocketEvents } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isToolRelatedError, modelKey } from '@proj-airi/core-agent'
import { listModels } from '@xsai/model'
import { uniqBy } from 'es-toolkit'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { createSparkCommandTool, debug, mcp } from '../tools'
import { useLlmToolsStore } from './llm-tools'
import { useModsServerChannelStore } from './mods/api/channel-server'

export type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
export { isContentArrayRelatedError, isToolRelatedError } from '@proj-airi/core-agent'

function toolNameFrom(tool: Tool) {
  const candidate = tool as Tool & {
    name?: string
    function?: {
      name?: string
    }
  }

  return candidate.function?.name ?? candidate.name
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())
  const modsServerChannelStore = useModsServerChannelStore()
  const llmToolsStore = useLlmToolsStore()

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = modelKey(model, chatProvider)
    // TODO(@nekomeowww,@shinohara-rin): we should not register the command callback on every stream anyway...
    const sendSparkCommand = (command: WebSocketEvents['spark:command']) => {
      // TODO(@nekomeowww): instruct the LLM to understand what destination is.
      // Currently without skill like prompt injection, many issues occur.
      // destination mostly are wrong or hallucinated, we need to find a way to make it more reliable.
      //
      // For now, since destinations as array will always broadcast to all connected modules/agents, we can set it to
      // empty array to avoid wrong routing.
      command.destinations = []

      modsServerChannelStore.send({
        type: 'spark:command',
        data: command,
      })
    }

    const builtinToolsResolver = async () => {
      await llmToolsStore.awaitPendingRegistrations()

      // Reverse twice so later runtime registrations win while original tool order stays stable.
      return uniqBy(
        [
          ...await mcp(),
          ...await debug(),
          ...await createSparkCommandTool({ sendSparkCommand }),
        ].toReversed(),
        tool => toolNameFrom(tool) ?? tool,
      ).toReversed()
    }

    const runStream = () => coreStreamFrom({
      model,
      chatProvider,
      messages,
      options: {
        ...options,
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
