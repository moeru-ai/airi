import { defineInvokeEventa } from '@moeru/eventa'

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
export interface AiriPluginXsaiToolDefinition {
  ownerExtensionId: string
  name: string
  description: string
  parameters: Record<string, unknown>
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
export interface AiriPluginToolsetPromptDefinition {
  ownerExtensionId: string
  id: string
  prompt: {
    id: string
    title?: string
    content: string
  }
}

/**
 * Serialized plugin xsai tools and shared prompt guidance.
 *
 * Use when:
 * - Refreshing renderer LLM tool registrations from the plugin host
 *
 * Expects:
 * - The host filtered out inactive plugin sessions
 *
 * Returns:
 * - N/A
 */
export interface AiriPluginXsaiToolsetDefinition {
  tools: AiriPluginXsaiToolDefinition[]
  prompts: AiriPluginToolsetPromptDefinition[]
}

export const airiPluginListXsaiTools = defineInvokeEventa<AiriPluginXsaiToolsetDefinition>('eventa:invoke:airi:plugins:tools:list-xsai')
export const airiPluginInvokeTool = defineInvokeEventa<unknown, {
  ownerExtensionId: string
  name: string
  input: unknown
}>('eventa:invoke:airi:plugins:tools:invoke')
