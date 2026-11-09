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
