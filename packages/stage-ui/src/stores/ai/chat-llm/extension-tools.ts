import type { StageToolRegistry } from '@proj-airi/plugin-sdk-stage/tools'

import { rawTool } from '@xsai/tool'

import { useLlmToolsStore } from './tools'
import { useLlmToolsetPromptsStore } from './toolset-prompts'

const toolIdPrefix = 'extension:'
const promptProviderId = 'extension-tools'

/**
 * Synchronizes serialized extension tools with the current LLM tool stores.
 *
 * The registry keeps callbacks host-local. This adapter recreates xsAI tools
 * in the active application and routes execution back to the registry owner.
 */
export async function synchronizeExtensionTools(registry: StageToolRegistry) {
  const llmToolsStore = useLlmToolsStore()
  const promptsStore = useLlmToolsetPromptsStore()
  const definitions = await registry.listSerializedXsaiTools()
  const registeredIds = llmToolsStore.tools
    .filter(tool => tool.id.startsWith(toolIdPrefix))
    .map(tool => tool.id)

  llmToolsStore.removeToolsByIds(...registeredIds)
  llmToolsStore.addTools(...definitions.tools.map(definition => ({
    ...rawTool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      execute: async input => await registry.invoke(definition.ownerExtensionId, definition.name, input),
    }),
    id: `${toolIdPrefix}${definition.ownerExtensionId}:${definition.name}`,
  })))
  promptsStore.registerToolsetPrompts(promptProviderId, definitions.prompts.map(definition => ({
    id: `${definition.ownerExtensionId}:${definition.id}`,
    title: definition.prompt.title,
    content: definition.prompt.content,
  })))
}

/** Removes all Extension-derived LLM tool definitions and prompt guidance. */
export function clearExtensionTools() {
  const llmToolsStore = useLlmToolsStore()
  const promptsStore = useLlmToolsetPromptsStore()
  llmToolsStore.removeToolsByIds(...llmToolsStore.tools
    .filter(tool => tool.id.startsWith(toolIdPrefix))
    .map(tool => tool.id))
  promptsStore.clearToolsetPrompts(promptProviderId)
}
