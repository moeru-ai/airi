import type { Tool } from '@xsai/shared-chat'
import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** A serializable tool definition shared between application contexts. */
export interface ToolDefinition extends Omit<Tool, 'execute'> {
  /** A stable application id. This id does not need to match the model-facing name. */
  id: string
  /** Includes this tool when a request does not select it explicitly. */
  defaultActive?: boolean
}

/** A tool definition with the executor that is available in the current runtime. */
export interface ExecutableTool extends Tool {
  /** A stable application id. This id does not need to match the model-facing name. */
  id: string
  /** Includes this tool when a request does not select it explicitly. */
  defaultActive?: boolean
}

function unavailableToolResult(name: string) {
  return `Tool "${name}" is not available now.`
}

/**
 * Stores serializable tool definitions and leader-local executors.
 *
 * The Pinia state contains definitions only. Call {@link addTools} from an
 * action that already runs in the elected leader. The executor map never
 * enters synchronized state.
 */
export const useLlmToolsStore = defineStore('llm-tools', () => {
  const tools = ref<ToolDefinition[]>([])
  const executors = new Map<string, Tool['execute']>()

  function executableToolFrom(definition: ToolDefinition): Tool {
    const execute = executors.get(definition.id)
      ?? (() => unavailableToolResult(definition.function.name))

    return {
      type: definition.type,
      function: definition.function,
      execute,
    }
  }

  const activeTools = computed<Tool[]>(() => tools.value
    .filter(tool => tool.defaultActive !== false)
    .map(executableToolFrom))

  /** Resolves registered tools in the requested model-facing name order. */
  function getToolsByNames(...names: string[]): Tool[] {
    return names.flatMap((name) => {
      const definition = tools.value.findLast(tool => tool.function.name === name)
      return definition ? [executableToolFrom(definition)] : []
    })
  }

  /** Adds tools or replaces existing tools that have the same application id. */
  function addTools(...nextTools: ExecutableTool[]) {
    const definitions = [...tools.value]

    for (const tool of nextTools) {
      const definition = structuredClone<ToolDefinition>({
        id: tool.id,
        type: tool.type,
        function: tool.function,
        ...(tool.defaultActive === undefined ? {} : { defaultActive: tool.defaultActive }),
      })
      const existingIndex = definitions.findIndex(item => item.id === tool.id)

      executors.set(tool.id, tool.execute)
      if (existingIndex >= 0) {
        definitions[existingIndex] = definition
        continue
      }

      definitions.push(definition)
    }

    tools.value = definitions
  }

  /** Removes one tool definition and its local executor. */
  function removeToolById(id: string) {
    removeToolsByIds(id)
  }

  /** Removes tool definitions and their local executors. */
  function removeToolsByIds(...ids: string[]) {
    if (ids.length === 0)
      return

    const idSet = new Set(ids)
    for (const id of idSet)
      executors.delete(id)

    tools.value = tools.value.filter(tool => !idSet.has(tool.id))
  }

  return {
    activeTools,
    addTools,
    getToolsByNames,
    removeToolById,
    removeToolsByIds,
    tools,
  }
}, {
  synced: {
    state: true,
  },
})
