import type { ExtensionModuleRef } from '@proj-airi/plugin-sdk'

import type {
  PluginToolDefinition,
  PluginToolsetPromptRegistration,
  ToolsetPromptManifest,
} from '../../tools'

import { toolKit } from '../../tools'

/**
 * Options used to register one Tamagotchi module toolset.
 *
 * @param TInputSchema Schema implementation accepted by each tool definition.
 */
export interface RegisterToolsOptions<TInputSchema = unknown> {
  /** Optional shared toolset prompt registered before any tools. */
  prompt?: PluginToolsetPromptRegistration | ToolsetPromptManifest
  /** Tool declarations registered in order through {@link toolKit}. */
  tools: Array<PluginToolDefinition<TInputSchema>>
}

/**
 * Normalizes shorthand toolset prompts into host registration input.
 *
 * Before:
 * - `{ id: "chess.prompt", content: "Prefer legal chess moves." }`
 *
 * After:
 * - `{ id: "chess.prompt", prompt: { id: "chess.prompt", content: "Prefer legal chess moves." } }`
 */
export function normalizePrompt(
  prompt: PluginToolsetPromptRegistration | ToolsetPromptManifest,
): PluginToolsetPromptRegistration {
  if ('prompt' in prompt) {
    return prompt
  }

  return {
    id: prompt.id,
    prompt,
  }
}

/**
 * Registers a module-scoped Tamagotchi toolset through the host tool kit.
 *
 * Use when:
 * - Extension modules need one helper to register a shared prompt and tools
 * - Tool authors want prompt registration to happen before tool registration
 *
 * Expects:
 * - `module` has access to {@link toolKit}
 * - `options.tools` contains schema-backed plugin tool definitions
 *
 * Returns:
 * - Resolves after the optional prompt and all tools are registered
 */
export async function registerTools<TInputSchema = unknown>(
  module: ExtensionModuleRef,
  options: RegisterToolsOptions<TInputSchema>,
): Promise<void> {
  const tools = await module.kits.use(toolKit)

  if (options.prompt) {
    await tools.registerToolsetPrompt(normalizePrompt(options.prompt))
  }

  for (const tool of options.tools) {
    await tools.registerTool(tool)
  }
}

export {
  type PluginToolDefinition,
  type PluginToolsetPromptRegistration,
  toolKit,
}
