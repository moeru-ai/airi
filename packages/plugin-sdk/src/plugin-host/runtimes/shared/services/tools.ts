import type {
  PluginToolDefinitionRecord,
  PluginToolsetPromptDefinitionRecord,
  RegisteredPluginToolDescriptor,
  SerializedToolsetPromptDefinition,
  SerializedXsaiToolDefinition,
  SerializedXsaiToolsetDefinition,
} from '../../../shared'

/**
 * Stores one plugin tool registration inside the in-memory host runtime.
 *
 * Use when:
 * - Tracking tool ownership and availability per plugin session
 *
 * Expects:
 * - `ownerPluginId` and `tool.id` together are unique
 *
 * Returns:
 * - A host-managed record used for listing and invocation
 */
export interface ToolRegistryRecord {
  ownerSessionId: string
  ownerPluginId: string
  tool: PluginToolDefinitionRecord
  availability?: () => Promise<boolean> | boolean
  execute: (input: unknown) => Promise<unknown> | unknown
}

/**
 * Stores one plugin toolset prompt registration inside the in-memory host runtime.
 *
 * Use when:
 * - Tracking prompt ownership and lifecycle for a plugin-owned toolset
 *
 * Expects:
 * - `ownerPluginId` and `toolset.id` together are unique
 *
 * Returns:
 * - A host-managed record used for prompt serialization
 */
export interface ToolsetPromptRegistryRecord {
  ownerSessionId: string
  ownerPluginId: string
  toolset: PluginToolsetPromptDefinitionRecord
  availability?: () => Promise<boolean> | boolean
}

/**
 * In-memory registry for plugin-contributed tools.
 *
 * Use when:
 * - The host needs to list plugin tools for UI and xsai consumers
 * - The host needs to dispatch a tool invocation back to its owning plugin
 *
 * Expects:
 * - Callers filter by ownership through `ownerPluginId`
 *
 * Returns:
 * - Serialisable metadata views and invoke routing
 */
export class ToolRegistryService {
  private readonly tools = new Map<string, ToolRegistryRecord>()
  private readonly toolsetPrompts = new Map<string, ToolsetPromptRegistryRecord>()

  register(record: ToolRegistryRecord) {
    const key = `${record.ownerPluginId}:${record.tool.id}`
    this.tools.set(key, record)
    return record
  }

  registerToolsetPrompt(record: ToolsetPromptRegistryRecord) {
    const key = `${record.ownerPluginId}:${record.toolset.id}`
    this.toolsetPrompts.set(key, record)
    return record
  }

  async listAvailableDescriptors() {
    const items: RegisteredPluginToolDescriptor[] = []

    for (const record of this.tools.values()) {
      if (await record.availability?.() === false) {
        continue
      }

      items.push({
        id: record.tool.id,
        title: record.tool.title,
        description: record.tool.description,
        activation: {
          keywords: [...record.tool.activation.keywords],
          patterns: [...record.tool.activation.patterns],
        },
      })
    }

    return items
  }

  async listToolsetPrompts() {
    const prompts: SerializedToolsetPromptDefinition[] = []

    for (const record of this.toolsetPrompts.values()) {
      if (await record.availability?.() === false) {
        continue
      }

      prompts.push({
        ownerPluginId: record.ownerPluginId,
        id: record.toolset.id,
        prompt: structuredClone(record.toolset.prompt),
      })
    }

    return prompts
  }

  async listSerializedXsaiTools(): Promise<SerializedXsaiToolsetDefinition> {
    const items: SerializedXsaiToolDefinition[] = []

    for (const record of this.tools.values()) {
      if (await record.availability?.() === false) {
        continue
      }

      items.push({
        ownerPluginId: record.ownerPluginId,
        name: record.tool.id,
        description: record.tool.description,
        parameters: structuredClone(record.tool.parameters),
      })
    }

    return {
      prompts: await this.listToolsetPrompts(),
      tools: items,
    }
  }

  async invoke(ownerPluginId: string, toolId: string, input: unknown) {
    const key = `${ownerPluginId}:${toolId}`
    const record = this.tools.get(key)
    if (!record) {
      throw new Error(`Plugin tool not found: ${key}`)
    }

    return await record.execute(input)
  }
}
