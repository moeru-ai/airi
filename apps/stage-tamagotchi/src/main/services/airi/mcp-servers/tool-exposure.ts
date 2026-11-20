import type { McpToolExposureMode } from '@proj-airi/stage-ui/types/mcp'

const directAgentTools = new Set(['computer_observe', 'computer_act', 'computer_verify', 'terminal_exec'])

/** Classifies bundled MCP tools before user overrides are applied. */
export function defaultBundledToolExposure(toolName: string): McpToolExposureMode {
  if (directAgentTools.has(toolName))
    return 'direct'

  return 'disabled'
}
