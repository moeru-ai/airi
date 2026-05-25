import type { ElectronPluginXsaiToolDefinition } from '../../shared/eventa/plugin/tools'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { extractMessageText } from '@proj-airi/stage-ui/libs/chat-sync'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { rawTool } from '@xsai/tool'
import { defineStore } from 'pinia'

import { electronPluginList } from '../../shared/eventa/plugin/host'
import { electronPluginInvokeTool, electronPluginListXsaiTools } from '../../shared/eventa/plugin/tools'

const PLUGIN_CONTEXT_ID_PREFIX = 'system:plugin:'
const MEMORY_SAVE_CONVERSATION_TOOL = 'memory_save_conversation'
const MEMORY_SEARCH_TOOL = 'memory_search'
const MEMORY_CONTEXT_TIMEOUT_MS = 3_000

function generateId(): string {
  return `plugin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Registers Electron-backed plugin xsai tools into the shared LLM tools store.
 *
 * Use when:
 * - The Tamagotchi renderer needs plugin-provided xsai tools during chat streaming
 *
 * Expects:
 * - Electron Eventa handlers for listing and invoking plugin tools are available
 *
 * Returns:
 * - Store actions for refreshing and disposing plugin runtime tools
 */
export const useTamagotchiPluginToolsStore = defineStore('tamagotchi-plugin-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
  const chatOrchestratorStore = useChatOrchestratorStore()
  const chatSession = useChatSessionStore()

  const listPluginXsaiToolDefinitions = useElectronEventaInvoke(electronPluginListXsaiTools)
  const invokePluginTool = useElectronEventaInvoke(electronPluginInvokeTool)
  const listPlugins = useElectronEventaInvoke(electronPluginList)

  const pluginsWithMemorySaveTool = new Set<string>()
  const pluginsWithMemorySearchTool = new Set<string>()

  let postProcessingUnsubscribe: (() => void) | null = null

  async function initialize() {
    try {
      await refresh()
      chatOrchestratorStore.registerRuntimeContextProvider(injectMemoryContext)
      registerPostProcessingHook()
    }
    catch (error) {
      console.error('[plugin-tools] failed to initialize:', error)
    }
  }

  async function refresh() {
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(new Error(`Timed out after ${5_000}ms`)), 5_000)

    return llmToolsStore.registerTools(
      'plugin-tools',
      listPluginXsaiToolDefinitions(undefined, { signal: abortController.signal })
        .catch((error: unknown) => {
          console.warn(`[plugin-tools] Failed to list plugin xsai tools: ${errorMessageFrom(error) ?? 'Unknown error'}`)
          return { prompts: [], tools: [] }
        })
        .finally(() => {
          clearTimeout(timeout)
        })
        .then((definitions: { prompts: Array<{ ownerPluginId: string, id: string, prompt: { id: string, title?: string, content: string } }>, tools: ElectronPluginXsaiToolDefinition[] }) => {
          llmToolsetPromptsStore.registerToolsetPrompts(
            'plugin-tools',
            definitions.prompts.map(definition => ({
              id: `${definition.ownerPluginId}:${definition.id}`,
              title: definition.prompt.title,
              content: definition.prompt.content,
            })),
          )

          pluginsWithMemorySaveTool.clear()
          pluginsWithMemorySearchTool.clear()
          for (const tool of definitions.tools) {
            if (tool.name === MEMORY_SAVE_CONVERSATION_TOOL) {
              pluginsWithMemorySaveTool.add(tool.ownerPluginId)
            }
            if (tool.name === MEMORY_SEARCH_TOOL) {
              pluginsWithMemorySearchTool.add(tool.ownerPluginId)
            }
          }

          return definitions.tools.map((definition: ElectronPluginXsaiToolDefinition) =>
            rawTool({
              name: definition.name,
              description: definition.description,
              parameters: definition.parameters,
              execute: async (input: Record<string, unknown>) => invokePluginTool({
                ownerPluginId: definition.ownerPluginId,
                name: definition.name,
                input,
              }),
            }),
          )
        }),
    )
  }

  function dispose() {
    llmToolsStore.clearTools('plugin-tools')
    llmToolsetPromptsStore.clearToolsetPrompts('plugin-tools')
    pluginsWithMemorySaveTool.clear()
    pluginsWithMemorySearchTool.clear()
    if (postProcessingUnsubscribe) {
      postProcessingUnsubscribe()
      postProcessingUnsubscribe = null
    }
  }

  async function injectMemoryContext(sendingMessage: string) {
    let snapshot
    try {
      snapshot = await listPlugins()
    }
    catch (error) {
      console.warn('[plugin-tools] failed to list plugins for memory context injection:', error)
      return undefined
    }
    const loadedPlugins = snapshot.plugins.filter(
      (p: { loaded: boolean, enabled: boolean, name: string }) => p.loaded && p.enabled && pluginsWithMemorySearchTool.has(p.name),
    )
    if (loadedPlugins.length === 0) {
      return undefined
    }

    const results = await Promise.allSettled(
      loadedPlugins.map(async (plugin) => {
        const result = await invokePluginTool({
          ownerPluginId: plugin.name,
          name: MEMORY_SEARCH_TOOL,
          input: { query: sendingMessage },
        }, { signal: AbortSignal.timeout(MEMORY_CONTEXT_TIMEOUT_MS) })

        const data = result as { results?: Array<Record<string, unknown>> }

        const contextText = (data.results ?? [])
          .map(item => `[${item.uri}]\n${String(item.abstract ?? '')}`)
          .join('\n\n')

        return contextText ? { text: contextText, pluginName: plugin.name } : null
      }),
    )

    const gathered: Array<{ text: string, pluginName: string }> = []
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        gathered.push(result.value)
      }
      else if (result.status === 'rejected') {
        console.warn('[plugin-tools] memory context lookup timed out or failed:', result.reason)
      }
    }

    if (gathered.length === 0)
      return undefined

    const combinedText = gathered
      .map(ctx => `[Plugin: ${ctx.pluginName}]\n${ctx.text}`)
      .join('\n\n')

    return {
      id: generateId(),
      contextId: PLUGIN_CONTEXT_ID_PREFIX,
      strategy: ContextUpdateStrategy.ReplaceSelf,
      text: combinedText,
      createdAt: Date.now(),
      metadata: {
        source: {
          id: 'plugin-memory',
          kind: 'plugin' as const,
          plugin: { id: 'plugin-memory' },
        },
      },
    }
  }

  function ensureConversationSessionId(): string {
    const sessionId = chatSession.activeSessionId
    if (!sessionId) {
      return `conversation_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    }
    const generation = chatSession.getSessionGeneration(sessionId)
    return `conversation_${sessionId}_gen${generation}`
  }

  function registerPostProcessingHook(): () => void {
    if (postProcessingUnsubscribe) {
      postProcessingUnsubscribe()
      postProcessingUnsubscribe = null
    }
    const unsubscribe = chatOrchestratorStore.onChatTurnComplete(async (chat, context) => {
      try {
        const snapshot = await listPlugins()
        const loadedPlugins = snapshot.plugins.filter(
          (p: { loaded: boolean, enabled: boolean, name: string }) => p.loaded && p.enabled && pluginsWithMemorySaveTool.has(p.name),
        )
        if (loadedPlugins.length === 0) {
          return
        }
        const userMessage = extractMessageText(context.message)
        const turn: Record<string, unknown> = {
          sessionId: ensureConversationSessionId(),
          userMessage,
          assistantResponse: chat.outputText,
          toolCalls: chat.output.tool_results,
          timestamp: new Date().toISOString(),
        }
        for (const plugin of loadedPlugins) {
          invokePluginTool({
            ownerPluginId: plugin.name,
            name: MEMORY_SAVE_CONVERSATION_TOOL,
            input: turn,
          }).catch((err: unknown) => console.warn(`[plugin-tools] failed to save turn to plugin "${plugin.name}"`, err))
        }
      }
      catch (error) {
        console.warn('[plugin-tools] post-processing hook failed:', error)
      }
    })
    postProcessingUnsubscribe = unsubscribe
    return unsubscribe
  }

  return {
    initialize,
    dispose,
    refresh,
  }
})
