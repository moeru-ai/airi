import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

/** Metadata used by a host to show one extension model tool. */
export interface RegisteredStageToolDescriptor {
  id: string
  title: string
  description: string
  activation: { keywords: string[], patterns: string[] }
}

/** JSON-schema model tool metadata that can cross a host boundary. */
export interface SerializedXsaiToolDefinition {
  ownerExtensionId: string
  name: string
  description: string
  parameters: HostDataRecord
}

/** Shared model guidance for an extension toolset. */
export interface ToolsetPromptManifest {
  id: string
  title?: string
  content: string
}

/** Prompt metadata together with its extension owner. */
export interface SerializedToolsetPromptDefinition {
  ownerExtensionId: string
  id: string
  prompt: ToolsetPromptManifest
}

/** The serializable model-tool view of a stage extension host. */
export interface SerializedXsaiToolsetDefinition {
  tools: SerializedXsaiToolDefinition[]
  prompts: SerializedToolsetPromptDefinition[]
}

/** Host-owned record for one registered model tool. */
export interface ToolRegistryRecord {
  ownerSessionId: string
  ownerExtensionId: string
  ownerModuleId?: string
  tool: {
    id: string
    title: string
    description: string
    activation: { keywords: string[], patterns: string[] }
    parameters: HostDataRecord
  }
  availability?: () => Promise<boolean> | boolean
  execute: (input: unknown) => Promise<unknown> | unknown
}

/** Host-owned record for one registered toolset prompt. */
export interface ToolsetPromptRegistryRecord {
  ownerSessionId: string
  ownerExtensionId: string
  ownerModuleId?: string
  toolset: { id: string, prompt: ToolsetPromptManifest }
  availability?: () => Promise<boolean> | boolean
}

/**
 * Stores model tool registrations for one stage host.
 *
 * The registry owns execution callbacks. Its public list methods return only
 * structured-clone-safe definitions that a renderer can adapt to xsAI tools.
 */
export class StageToolRegistry {
  private readonly tools = new Map<string, ToolRegistryRecord>()
  private readonly prompts = new Map<string, ToolsetPromptRegistryRecord>()

  register(record: ToolRegistryRecord) {
    this.tools.set(`${record.ownerExtensionId}:${record.tool.id}`, record)
  }

  registerToolsetPrompt(record: ToolsetPromptRegistryRecord) {
    this.prompts.set(`${record.ownerExtensionId}:${record.toolset.id}`, record)
  }

  unregisterOwnerScope(ownerSessionId: string, ownerModuleId?: string) {
    this.removeWhere(this.tools, record => record.ownerSessionId === ownerSessionId && record.ownerModuleId === ownerModuleId)
    this.removeWhere(this.prompts, record => record.ownerSessionId === ownerSessionId && record.ownerModuleId === ownerModuleId)
  }

  clear() {
    this.tools.clear()
    this.prompts.clear()
  }

  async listAvailableDescriptors(): Promise<RegisteredStageToolDescriptor[]> {
    const descriptors: RegisteredStageToolDescriptor[] = []
    for (const record of this.tools.values()) {
      if (await record.availability?.() === false) {
        continue
      }
      descriptors.push({
        id: record.tool.id,
        title: record.tool.title,
        description: record.tool.description,
        activation: {
          keywords: [...record.tool.activation.keywords],
          patterns: [...record.tool.activation.patterns],
        },
      })
    }
    return descriptors
  }

  async listSerializedXsaiTools(): Promise<SerializedXsaiToolsetDefinition> {
    const tools: SerializedXsaiToolDefinition[] = []
    const prompts: SerializedToolsetPromptDefinition[] = []
    for (const record of this.tools.values()) {
      if (await record.availability?.() !== false) {
        tools.push({
          ownerExtensionId: record.ownerExtensionId,
          name: record.tool.id,
          description: record.tool.description,
          parameters: structuredClone(record.tool.parameters),
        })
      }
    }
    for (const record of this.prompts.values()) {
      if (await record.availability?.() !== false) {
        prompts.push({
          ownerExtensionId: record.ownerExtensionId,
          id: record.toolset.id,
          prompt: structuredClone(record.toolset.prompt),
        })
      }
    }
    return { prompts, tools }
  }

  async invoke(ownerExtensionId: string, toolId: string, input: unknown) {
    const key = `${ownerExtensionId}:${toolId}`
    const record = this.tools.get(key)
    if (!record) {
      throw new Error(`Stage extension tool not found: ${key}`)
    }
    return await record.execute(input)
  }

  private removeWhere<T>(records: Map<string, T>, predicate: (record: T) => boolean) {
    for (const [key, record] of records) {
      if (predicate(record)) {
        records.delete(key)
      }
    }
  }
}
