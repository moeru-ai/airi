import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

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
  activation: {
    keywords: string[]
    patterns: string[]
  }
  description: string
  id: string
  title: string
}

/**
 * Describes why plugin-backed runtime tools should be refreshed.
 *
 * Use when:
 * - The main process notifies renderers after plugin lifecycle changes
 *
 * Expects:
 * - `extensionId` is present when the change is scoped to one extension
 *
 * Returns:
 * - N/A
 */
export interface ElectronPluginToolsChangedPayload {
  extensionId?: string
  reason: 'enabled-state-changed' | 'load-enabled' | 'loaded' | 'unloaded'
}

/**
 * Serialized toolset prompt exposed by the plugin host.
 *
 * Use when:
 * - Registering plugin-backed prompt guidance in the renderer
 *
 * Expects:
 * - `content` is already model-facing prompt text
 *
 * Returns:
 * - N/A
 */
export interface ElectronPluginToolsetPromptDefinition {
  id: string
  ownerExtensionId: string
  prompt: {
    content: string
    id: string
    title?: string
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
  description: string
  name: string
  ownerExtensionId: string
  parameters: Record<string, unknown>
}

/**
 * Serialized plugin xsai tools and shared prompt guidance.
 *
 * Use when:
 * - Refreshing renderer LLM tool registrations from the Electron plugin host
 *
 * Expects:
 * - The host filtered out inactive plugin sessions
 *
 * Returns:
 * - N/A
 */
export interface ElectronPluginXsaiToolsetDefinition {
  prompts: ElectronPluginToolsetPromptDefinition[]
  tools: ElectronPluginXsaiToolDefinition[]
}

export const electronPluginListAgentTools = defineInvokeEventa<ElectronPluginToolDescriptor[]>('eventa:invoke:electron:plugins:tools:list')
export const electronPluginListXsaiTools = defineInvokeEventa<ElectronPluginXsaiToolsetDefinition>('eventa:invoke:electron:plugins:tools:list-xsai')
export const electronPluginInvokeTool = defineInvokeEventa<unknown, {
  input: unknown
  name: string
  ownerExtensionId: string
}>('eventa:invoke:electron:plugins:tools:invoke')
export const electronPluginToolsChanged = defineEventa<ElectronPluginToolsChangedPayload>('eventa:event:electron:plugins:tools:changed')
