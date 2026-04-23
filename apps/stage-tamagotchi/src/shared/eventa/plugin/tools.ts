import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Renderer-facing plugin tool descriptor used by agent tooling UIs.
 *
 * Use when:
 * - Listing plugin-backed tools for discovery or debugging
 *
 * Expects:
 * - Activation metadata is already normalized for renderer display
 *
 * Returns:
 * - N/A
 */
export interface ElectronPluginToolDescriptor {
  id: string
  title: string
  description: string
  activation: {
    keywords: string[]
    patterns: string[]
  }
}

/**
 * Serialized xsai tool definition exposed by the plugin host.
 *
 * Use when:
 * - Registering plugin-backed xsai tools in the renderer
 *
 * Expects:
 * - `parameters` is a provider-compliant JSON Schema object
 *
 * Returns:
 * - N/A
 */
export interface ElectronPluginXsaiToolDefinition {
  ownerPluginId: string
  name: string
  description: string
  parameters: Record<string, unknown>
}

export const electronPluginListAgentTools = defineInvokeEventa<ElectronPluginToolDescriptor[]>('eventa:invoke:electron:plugins:tools:list')
export const electronPluginListXsaiTools = defineInvokeEventa<ElectronPluginXsaiToolDefinition[]>('eventa:invoke:electron:plugins:tools:list-xsai')
export const electronPluginInvokeTool = defineInvokeEventa<unknown, {
  ownerPluginId: string
  name: string
  input: unknown
}>('eventa:invoke:electron:plugins:tools:invoke')
