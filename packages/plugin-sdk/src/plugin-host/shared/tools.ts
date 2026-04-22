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
