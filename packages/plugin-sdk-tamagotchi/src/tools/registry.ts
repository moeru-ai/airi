import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

/**
 * Describes the user-facing metadata for a Tamagotchi extension tool.
 */
export interface RegisteredPluginToolDescriptor {
  id: string
  title: string
  description: string
  activation: {
    keywords: string[]
    patterns: string[]
  }
}

/**
 * Describes the JSON-schema side of an xsai-compatible Tamagotchi extension tool.
 */
export interface SerializedXsaiToolDefinition {
  ownerExtensionId: string
  name: string
  description: string
  parameters: HostDataRecord
}

/**
 * Describes model-facing guidance shared by every tool in one toolset.
 */
export interface ToolsetPromptManifest {
  id: string
  title?: string
  content: string
}

/**
 * Captures one registered toolset prompt with extension ownership metadata.
 */
export interface SerializedToolsetPromptDefinition {
  ownerExtensionId: string
  id: string
  prompt: ToolsetPromptManifest
}

/**
 * Bundles xsai tools with their shared toolset prompt contributions.
 */
export interface SerializedXsaiToolsetDefinition {
  tools: SerializedXsaiToolDefinition[]
  prompts: SerializedToolsetPromptDefinition[]
}

/**
 * Captures the single source-of-truth definition submitted by a Tamagotchi extension.
 */
export interface PluginToolDefinitionRecord {
  id: string
  title: string
  description: string
  activation: {
    keywords: string[]
    patterns: string[]
  }
  parameters: HostDataRecord
}

/**
 * Captures an extension-owned prompt shared by a toolset.
 */
export interface PluginToolsetPromptDefinitionRecord {
  id: string
  prompt: ToolsetPromptManifest
}

/**
 * Stores one Tamagotchi extension tool registration inside the host runtime.
 */
export interface ToolRegistryRecord {
  ownerSessionId: string
  ownerExtensionId: string
  ownerModuleId?: string
  tool: PluginToolDefinitionRecord
  availability?: () => Promise<boolean> | boolean
  execute: (input: unknown) => Promise<unknown> | unknown
}

/**
 * Stores one Tamagotchi extension toolset prompt registration inside the host runtime.
 */
export interface ToolsetPromptRegistryRecord {
  ownerSessionId: string
  ownerExtensionId: string
  ownerModuleId?: string
  toolset: PluginToolsetPromptDefinitionRecord
  availability?: () => Promise<boolean> | boolean
}

/**
 * In-memory registry for Tamagotchi extension tools.
 *
 * Use when:
 * - A Tamagotchi host needs to list extension tools for UI and xsai consumers
 * - A Tamagotchi host needs to dispatch a tool invocation back to its owning extension
 *
 * Expects:
 * - Callers provide extension session and optional module ownership during registration
 *
 * Returns:
 * - Serializable metadata views and invoke routing
 */
export class TamagotchiToolRegistry {
  private readonly tools = new Map<string, ToolRegistryRecord>()
  private readonly toolsetPrompts = new Map<string, ToolsetPromptRegistryRecord>()

  register(record: ToolRegistryRecord) {
    const key = `${record.ownerExtensionId}:${record.tool.id}`
    this.tools.set(key, record)
    return record
  }

  registerToolsetPrompt(record: ToolsetPromptRegistryRecord) {
    const key = `${record.ownerExtensionId}:${record.toolset.id}`
    this.toolsetPrompts.set(key, record)
    return record
  }

  unregister(ownerExtensionId: string, toolId: string) {
    return this.tools.delete(`${ownerExtensionId}:${toolId}`)
  }

  unregisterToolsetPrompt(ownerExtensionId: string, toolsetId: string) {
    return this.toolsetPrompts.delete(`${ownerExtensionId}:${toolsetId}`)
  }

  unregisterOwnerSession(ownerSessionId: string) {
    for (const [key, record] of this.tools) {
      if (record.ownerSessionId === ownerSessionId) {
        this.tools.delete(key)
      }
    }

    for (const [key, record] of this.toolsetPrompts) {
      if (record.ownerSessionId === ownerSessionId) {
        this.toolsetPrompts.delete(key)
      }
    }
  }

  unregisterOwnerScope(ownerSessionId: string, ownerModuleId?: string) {
    for (const [key, record] of this.tools) {
      if (record.ownerSessionId === ownerSessionId && record.ownerModuleId === ownerModuleId) {
        this.tools.delete(key)
      }
    }

    for (const [key, record] of this.toolsetPrompts) {
      if (record.ownerSessionId === ownerSessionId && record.ownerModuleId === ownerModuleId) {
        this.toolsetPrompts.delete(key)
      }
    }
  }

  clear() {
    this.tools.clear()
    this.toolsetPrompts.clear()
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
        ownerExtensionId: record.ownerExtensionId,
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
        ownerExtensionId: record.ownerExtensionId,
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

  async invoke(ownerExtensionId: string, toolId: string, input: unknown) {
    const key = `${ownerExtensionId}:${toolId}`
    const record = this.tools.get(key)
    if (!record) {
      throw new Error(`Tamagotchi extension tool not found: ${key}`)
    }

    return await record.execute(input)
  }
}
