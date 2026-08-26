import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

/**
 * Captures the single source-of-truth definition submitted by a Tamagotchi extension.
 */
export interface PluginToolDefinitionRecord {
  activation: {
    keywords: string[]
    patterns: string[]
  }
  description: string
  id: string
  parameters: HostDataRecord
  title: string
}

/**
 * Captures an extension-owned prompt shared by a toolset.
 */
export interface PluginToolsetPromptDefinitionRecord {
  id: string
  prompt: ToolsetPromptManifest
}

/**
 * Describes the user-facing metadata for a Tamagotchi extension tool.
 */
export interface RegisteredPluginToolDescriptor {
  activation: {
    keywords: string[]
    patterns: string[]
  }
  description: string
  id: string
  title: string
}

/**
 * Captures one registered toolset prompt with extension ownership metadata.
 */
export interface SerializedToolsetPromptDefinition {
  id: string
  ownerExtensionId: string
  prompt: ToolsetPromptManifest
}

/**
 * Describes the JSON-schema side of an xsai-compatible Tamagotchi extension tool.
 */
export interface SerializedXsaiToolDefinition {
  description: string
  name: string
  ownerExtensionId: string
  parameters: HostDataRecord
}

/**
 * Bundles xsai tools with their shared toolset prompt contributions.
 */
export interface SerializedXsaiToolsetDefinition {
  prompts: SerializedToolsetPromptDefinition[]
  tools: SerializedXsaiToolDefinition[]
}

/**
 * Stores one Tamagotchi extension tool registration inside the host runtime.
 */
export interface ToolRegistryRecord {
  availability?: () => boolean | Promise<boolean>
  execute: (input: unknown) => Promise<unknown> | unknown
  ownerExtensionId: string
  ownerModuleId?: string
  ownerSessionId: string
  tool: PluginToolDefinitionRecord
}

/**
 * Describes model-facing guidance shared by every tool in one toolset.
 */
export interface ToolsetPromptManifest {
  content: string
  id: string
  title?: string
}

/**
 * Stores one Tamagotchi extension toolset prompt registration inside the host runtime.
 */
export interface ToolsetPromptRegistryRecord {
  availability?: () => boolean | Promise<boolean>
  ownerExtensionId: string
  ownerModuleId?: string
  ownerSessionId: string
  toolset: PluginToolsetPromptDefinitionRecord
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

  clear() {
    this.tools.clear()
    this.toolsetPrompts.clear()
  }

  async invoke(ownerExtensionId: string, toolId: string, input: unknown) {
    const key = `${ownerExtensionId}:${toolId}`
    const record = this.tools.get(key)
    if (!record) {
      throw new Error(`Tamagotchi extension tool not found: ${key}`)
    }

    return await record.execute(input)
  }

  async listAvailableDescriptors() {
    const items: RegisteredPluginToolDescriptor[] = []

    for (const record of this.tools.values()) {
      if (await record.availability?.() === false) {
        continue
      }

      items.push({
        activation: {
          keywords: [...record.tool.activation.keywords],
          patterns: [...record.tool.activation.patterns],
        },
        description: record.tool.description,
        id: record.tool.id,
        title: record.tool.title,
      })
    }

    return items
  }

  async listSerializedXsaiTools(): Promise<SerializedXsaiToolsetDefinition> {
    const items: SerializedXsaiToolDefinition[] = []

    for (const record of this.tools.values()) {
      if (await record.availability?.() === false) {
        continue
      }

      items.push({
        description: record.tool.description,
        name: record.tool.id,
        ownerExtensionId: record.ownerExtensionId,
        parameters: structuredClone(record.tool.parameters),
      })
    }

    return {
      prompts: await this.listToolsetPrompts(),
      tools: items,
    }
  }

  async listToolsetPrompts() {
    const prompts: SerializedToolsetPromptDefinition[] = []

    for (const record of this.toolsetPrompts.values()) {
      if (await record.availability?.() === false) {
        continue
      }

      prompts.push({
        id: record.toolset.id,
        ownerExtensionId: record.ownerExtensionId,
        prompt: structuredClone(record.toolset.prompt),
      })
    }

    return prompts
  }

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

  unregisterToolsetPrompt(ownerExtensionId: string, toolsetId: string) {
    return this.toolsetPrompts.delete(`${ownerExtensionId}:${toolsetId}`)
  }
}
