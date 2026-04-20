import type { StreamOptions } from '@proj-airi/core-agent'
import type { WebSocketEvents } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { streamFrom as coreStreamFrom, isToolRelatedError, modelKey } from '@proj-airi/core-agent'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { createSparkCommandTool, debug, mcp } from '../tools'
import { useModsServerChannelStore } from './mods/api/channel-server'

export type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
export { isToolRelatedError } from '@proj-airi/core-agent'

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const modsServerChannelStore = useModsServerChannelStore()

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = modelKey(model, chatProvider)
    try {
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

      await coreStreamFrom({
        model,
        chatProvider,
        messages,
        options: { ...options, toolsCompatibility: toolsCompatibility.value },
        builtinToolsResolver: async () => [
          ...await mcp(),
          ...await debug(),
          await createSparkCommandTool({ sendSparkCommand }),
        ],
      })
    }
    catch (err) {
      if (isToolRelatedError(err)) {
        console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error`)
        toolsCompatibility.value.set(key, false)
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
