import type { EventContext } from '@moeru/eventa'

import type { PluginToolDefinitionRecord, PluginToolsetPromptDefinitionRecord } from '../../../../plugin-host/shared'

/**
 * Identifies the bound API call used to register plugin tools.
 *
 * Use when:
 * - Declaring permissions for `apis.tools.register()`
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for tool registration
 */
export const pluginToolApiRegisterEventName = 'proj-airi:plugin-sdk:apis:client:tools:register'
/**
 * Identifies the shared resource namespace that stores plugin tool records.
 *
 * Use when:
 * - Declaring write permissions for tool registration
 *
 * Expects:
 * - The host stores tool definitions under this resource key
 *
 * Returns:
 * - The resource key string for the tool registry
 */
export const pluginToolRegistryResourceKey = 'proj-airi:plugin-sdk:resources:tools'

/**
 * Carries a low-level plugin tool registration request into the host.
 *
 * Use when:
 * - A plugin has already normalized its tool metadata and JSON Schema
 *
 * Expects:
 * - `tool` is serializable and validated by the caller
 * - `execute` accepts JSON-compatible input from the host
 *
 * Returns:
 * - A registration payload consumed by the bound host implementation
 */
export interface RegisterToolInput {
  tool: PluginToolDefinitionRecord
  availability?: () => Promise<boolean> | boolean
  execute: (input: unknown) => Promise<unknown> | unknown
}

/**
 * Carries one low-level toolset prompt registration request into the host.
 *
 * Use when:
 * - A plugin wants shared model-facing guidance for a group of tools
 *
 * Expects:
 * - `id` is stable within the owning plugin
 *
 * Returns:
 * - A registration payload consumed by the bound host implementation
 */
export type RegisterToolsetPromptInput = PluginToolsetPromptDefinitionRecord

/**
 * Defines the host-side callbacks needed by the low-level plugin tool client.
 *
 * Use when:
 * - Wiring plugin session APIs to host-owned registries
 *
 * Expects:
 * - `register` stores or forwards the tool definition in the host
 *
 * Returns:
 * - The bound client methods used by {@link createTools}
 */
export interface ToolClientBindings {
  register: (input: RegisterToolInput) => Promise<void> | void
  registerToolsetPrompt: (input: RegisterToolsetPromptInput) => Promise<void> | void
}

function createMissingBindingError(method: string) {
  return new Error(`Plugin tool API binding missing for \`${method}\`.`)
}

function requireBinding<TBinding>(binding: TBinding | undefined, method: string): TBinding {
  if (!binding) {
    throw createMissingBindingError(method)
  }

  return binding
}

/**
 * Creates the low-level plugin tool client surface exposed on `session.apis`.
 *
 * Use when:
 * - Building the plugin SDK API object for a specific session
 *
 * Expects:
 * - `bindings` comes from a host that knows how to store tool registrations
 *
 * Returns:
 * - A minimal `tools.register(...)` client
 */
export function createTools(_ctx: EventContext<any, any>, bindings?: ToolClientBindings) {
  return {
    async register(input: RegisterToolInput) {
      return await requireBinding(bindings, 'tools.register').register(input)
    },
    async registerToolsetPrompt(input: RegisterToolsetPromptInput) {
      return await requireBinding(bindings, 'tools.registerToolsetPrompt').registerToolsetPrompt(input)
    },
  }
}

/**
 * Describes the concrete client object returned by {@link createTools}.
 *
 * Use when:
 * - Typing `apis.tools`
 *
 * Expects:
 * - The caller uses the same method set as the runtime-created tools client
 *
 * Returns:
 * - The inferred tools client surface
 */
export type ToolClient = ReturnType<typeof createTools>
