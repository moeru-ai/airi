import type { HostDataRecord } from './types'

/**
 * Describes the user-facing metadata for a plugin-contributed tool.
 *
 * Use when:
 * - Listing plugin tools in renderer or devtools surfaces
 * - Exposing activation hints without the execution handler
 *
 * Expects:
 * - `id` is stable and unique within the owning plugin
 *
 * Returns:
 * - A serializable descriptor suitable for host and renderer registries
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
 * Describes the JSON-schema side of an xsai-compatible tool.
 *
 * Use when:
 * - Serializing plugin tools across Electron boundaries
 * - Reconstructing proxy `rawTool(...)` instances in the renderer
 *
 * Expects:
 * - `parameters` is a provider-safe JSON Schema object
 *
 * Returns:
 * - A serializable tool contract without executable callbacks
 */
export interface SerializedXsaiToolDefinition {
  ownerPluginId: string
  name: string
  description: string
  parameters: HostDataRecord
}

/**
 * Describes model-facing guidance shared by every tool in one plugin toolset.
 *
 * Use when:
 * - A toolset needs shared usage policy without duplicating prompt text on each tool
 *
 * Expects:
 * - `content` is ready to append into a runtime system prompt
 *
 * Returns:
 * - A serializable manifest that the host can pass to renderer prompt stores
 */
export interface ToolsetPromptManifest {
  id: string
  title?: string
  content: string
}

/**
 * Captures one registered toolset prompt with plugin ownership metadata.
 *
 * Use when:
 * - Serializing plugin-contributed toolset guidance across host boundaries
 *
 * Expects:
 * - `id` is stable within the owning plugin session
 *
 * Returns:
 * - A prompt contribution suitable for renderer LLM prompt injection
 */
export interface SerializedToolsetPromptDefinition {
  ownerPluginId: string
  id: string
  prompt: ToolsetPromptManifest
}

/**
 * Bundles plugin xsai tools with their shared toolset prompt contributions.
 *
 * Use when:
 * - The renderer refreshes plugin-backed tools and model prompt guidance together
 *
 * Expects:
 * - Tools and prompts have already been filtered for active sessions
 *
 * Returns:
 * - A serializable snapshot for renderer tool and prompt stores
 */
export interface SerializedXsaiToolsetDefinition {
  tools: SerializedXsaiToolDefinition[]
  prompts: SerializedToolsetPromptDefinition[]
}

/**
 * Captures the single source-of-truth definition submitted by a plugin.
 *
 * Use when:
 * - Registering tools from plugin runtimes into the host
 *
 * Expects:
 * - `parameters` already contains a serialized input schema
 *
 * Returns:
 * - A host-owned record that can be derived into UI metadata and xsai schemas
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
 * Captures a plugin-owned prompt shared by a toolset.
 *
 * Use when:
 * - A plugin registers model-facing guidance for a group of related tools
 *
 * Expects:
 * - `prompt` content is validated by the authoring helper or caller
 *
 * Returns:
 * - A host-owned record that can be filtered by session lifecycle
 */
export interface PluginToolsetPromptDefinitionRecord {
  id: string
  prompt: ToolsetPromptManifest
}
