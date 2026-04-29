import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { rawTool } from '@xsai/tool'
import { defineStore } from 'pinia'

import { electronPluginInvokeTool, electronPluginListXsaiTools } from '../../shared/eventa/plugin/tools'

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
  const listPluginXsaiToolDefinitions = useElectronEventaInvoke(electronPluginListXsaiTools)
  const invokePluginTool = useElectronEventaInvoke(electronPluginInvokeTool)

  async function refresh() {
    return llmToolsStore.registerTools('plugin-tools', listPluginXsaiToolDefinitions().then(definitions =>
      definitions.map(definition =>
        rawTool({
          name: definition.name,
          description: definition.description,
          parameters: definition.parameters,
          execute: async input => invokePluginTool({
            ownerPluginId: definition.ownerPluginId,
            name: definition.name,
            input,
          }),
        }),
      ),
    ))
  }

  function dispose() {
    llmToolsStore.clearTools('plugin-tools')
  }

  return {
    dispose,
    refresh,
  }
})
