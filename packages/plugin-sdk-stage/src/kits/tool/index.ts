import type { ExtensionModuleRef } from '@proj-airi/plugin-sdk'

import type { PluginToolDefinition, PluginToolsetPromptRegistration, ToolsetPromptManifest } from '../../tools'

import { toolKit } from '../../tools'

/** Options used to register a complete module model-tool contribution. */
export interface RegisterToolsOptions<TInputSchema = unknown> {
  prompt?: PluginToolsetPromptRegistration | ToolsetPromptManifest
  tools: Array<PluginToolDefinition<TInputSchema>>
}

/** Converts a short toolset prompt to the host registration shape. */
export function normalizePrompt(prompt: PluginToolsetPromptRegistration | ToolsetPromptManifest): PluginToolsetPromptRegistration {
  return 'prompt' in prompt ? prompt : { id: prompt.id, prompt }
}

/** Registers a module-scoped model toolset through the portable tool kit. */
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

export { type PluginToolDefinition, type PluginToolsetPromptRegistration, toolKit }
