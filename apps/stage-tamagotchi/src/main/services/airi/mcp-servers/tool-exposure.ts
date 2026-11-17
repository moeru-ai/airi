import type { McpToolExposureMode } from '@proj-airi/stage-ui/types/mcp'

/** Classifies bundled MCP tools before user overrides are applied. */
export function defaultBundledToolExposure(toolName: string): McpToolExposureMode {
  if (['computer_observe', 'computer_act', 'computer_verify', 'terminal_exec'].includes(toolName))
    return 'direct'

  if (['desktop_list_pending_actions', 'desktop_get_session_trace', 'desktop_get_state', 'terminal_get_state', 'pty_get_status'].includes(toolName))
    return 'disabled'

  return 'router-only'
}
