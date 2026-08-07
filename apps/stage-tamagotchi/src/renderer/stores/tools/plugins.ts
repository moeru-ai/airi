import type { ExecutableTool } from '@proj-airi/stage-ui/stores/llm-tools'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { rawTool } from '@xsai/tool'
import { defineStore } from 'pinia'

import { electronPluginInvokeTool, electronPluginListXsaiTools } from '../../../shared/eventa/plugin/tools'

export const useTamagotchiPluginToolsStore = defineStore('tamagotchi-plugin-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
  const listPluginXsaiToolDefinitions = useElectronEventaInvoke(electronPluginListXsaiTools)
  const invokePluginTool = useElectronEventaInvoke(electronPluginInvokeTool)
  const toolIdPrefix = 'plugin:'

  function registeredToolIds() {
    return llmToolsStore.tools
      .filter(tool => tool.id.startsWith(toolIdPrefix))
      .map(tool => tool.id)
  }

  async function refresh() {
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(new Error(`Timed out after ${5_000}ms`)), 5_000)

    const definitions = await listPluginXsaiToolDefinitions(undefined, { signal: abortController.signal })
      .catch((error) => {
        console.warn(`[plugin-tools] Failed to list plugin xsai tools: ${errorMessageFrom(error) ?? 'Unknown error'}`)
        return { prompts: [], tools: [] }
      })
      .finally(() => {
        clearTimeout(timeout)
      })

    llmToolsetPromptsStore.registerToolsetPrompts(
      'plugin-tools',
      definitions.prompts.map(definition => ({
        id: `${definition.ownerExtensionId}:${definition.id}`,
        title: definition.prompt.title,
        content: definition.prompt.content,
      })),
    )

    const tools = definitions.tools.map((definition): ExecutableTool => ({
      ...rawTool({
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
        execute: async input => invokePluginTool({
          ownerExtensionId: definition.ownerExtensionId,
          name: definition.name,
          input,
        }),
      }),
      id: `${toolIdPrefix}${definition.ownerExtensionId}:${definition.name}`,
    }))

    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsStore.addTools(...tools)
  }

  function dispose() {
    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsetPromptsStore.clearToolsetPrompts('plugin-tools')
  }

  return {
    dispose,
    refresh,
  }
}, {
  synced: {
    actions: ['dispose', 'refresh'],
    state: false,
  },
})
