import type { ElectronPluginXsaiToolDefinition } from '../../shared/eventa/plugin/tools'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatContextStore } from '@proj-airi/stage-ui/stores/chat/context-store'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { rawTool } from '@xsai/tool'
import { defineStore } from 'pinia'

import { electronPluginQueryContext } from '../../shared/eventa/plugin/context'
import { electronPluginList } from '../../shared/eventa/plugin/host'
import { electronPluginInvokeTool, electronPluginListXsaiTools } from '../../shared/eventa/plugin/tools'

const PLUGIN_CONTEXT_ID_PREFIX = 'system:plugin:'

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
  const chatContext = useChatContextStore()

  const listPluginXsaiToolDefinitions = useElectronEventaInvoke(electronPluginListXsaiTools)
  const invokePluginTool = useElectronEventaInvoke(electronPluginInvokeTool)
  const queryPluginContext = useElectronEventaInvoke(electronPluginQueryContext)
  const listPlugins = useElectronEventaInvoke(electronPluginList)

  let postProcessingUnsubscribe: (() => void) | null = null
  let unregisterContextProvider: (() => void) | null = null

  async function initialize() {
    try {
      await refresh()
      unregisterContextProvider = chatOrchestratorStore.registerContextProvider(
        (userMessage: string) => injectMemoryContext(userMessage),
      )
      registerPostProcessingHook()
      console.info('[plugin-tools] initialized')
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
    if (postProcessingUnsubscribe) {
      postProcessingUnsubscribe()
      postProcessingUnsubscribe = null
    }
    if (unregisterContextProvider) {
      unregisterContextProvider()
      unregisterContextProvider = null
    }
  }

  async function injectMemoryContext(userMessage: string) {
    const snapshot = await listPlugins()
    const loadedPlugins = snapshot.plugins.filter((p: { loaded: boolean, enabled: boolean }) => p.loaded && p.enabled)
    if (loadedPlugins.length === 0) {
      console.info('[plugin-tools] injectMemoryContext: no loaded plugins')
      return undefined
    }
    for (const plugin of loadedPlugins) {
      try {
        const result = await queryPluginContext({ pluginName: plugin.name, query: userMessage })
        console.info(`[plugin-tools] injectMemoryContext: plugin="${plugin.name}" found ${result.contexts.length} context(s)`)
        if (result.contexts.length === 0) {
          continue
        }
        const contextText = result.contexts.map((c: { text: string }) => c.text).join('\n')
        chatContext.ingestContextMessage({
          id: generateId(),
          contextId: `${PLUGIN_CONTEXT_ID_PREFIX}${plugin.name}`,
          strategy: ContextUpdateStrategy.ReplaceSelf,
          text: contextText,
          createdAt: Date.now(),
          metadata: {
            source: {
              id: plugin.name,
              kind: 'plugin' as const,
              plugin: { id: plugin.name },
            },
          },
        })
      }
      catch (error) {
        console.warn(`[plugin-tools] failed to inject memory context from plugin "${plugin.name}":`, error)
      }
    }
    return undefined
  }

  function registerPostProcessingHook(): () => void {
    if (postProcessingUnsubscribe) {
      postProcessingUnsubscribe()
      postProcessingUnsubscribe = null
    }
    const unsubscribe = chatOrchestratorStore.onChatTurnComplete(async (chat: any) => {
      const snapshot = await listPlugins()
      const loadedPlugins = snapshot.plugins.filter((p: { loaded: boolean, enabled: boolean }) => p.loaded && p.enabled)
      if (loadedPlugins.length === 0) {
        console.info('[plugin-tools] onChatTurnComplete: no loaded plugins')
        return
      }
      const userMessage = chat.output.content
      const turn: Record<string, unknown> = {
        userMessage: typeof userMessage === 'string' ? userMessage : '',
        assistantResponse: chat.outputText,
        toolCalls: chat.output.tool_results,
        timestamp: new Date().toISOString(),
      }
      for (const plugin of loadedPlugins) {
        invokePluginTool({
          ownerPluginId: plugin.name,
          name: 'memory/save_conversation',
          input: turn,
        }).catch((err: unknown) => console.warn(`[plugin-tools] failed to save turn to plugin "${plugin.name}"`, err))
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
