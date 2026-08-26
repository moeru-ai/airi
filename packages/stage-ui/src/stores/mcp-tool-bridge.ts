/**
 * Minimal bridge interface for calling MCP tools from the desktop overlay
 * renderer without a direct dependency on the MCP server runtime.
 *
 * The bridge is set by the Electron main/preload layer (or by a test stub)
 * and retrieved by overlay pages that need to invoke computer-use MCP tools.
 */

export interface McpCallToolPayload {
  arguments?: Record<string, unknown>
  name: string
}

export interface McpCallToolResult {
  content?: Array<Record<string, unknown>>
  isError?: boolean
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
}

export interface McpToolDescriptor {
  description?: string
  inputSchema: Record<string, unknown>
  name: string
  serverName: string
  toolName: string
}

interface McpToolBridge {
  callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>
  listTools: () => Promise<McpToolDescriptor[]>
}

let bridge: McpToolBridge | undefined

export function clearMcpToolBridge() {
  bridge = undefined
}

export function getMcpToolBridge(): McpToolBridge {
  if (!bridge) {
    throw new Error('MCP tool bridge is not available in this runtime.')
  }

  return bridge
}

export function setMcpToolBridge(nextBridge: McpToolBridge) {
  bridge = nextBridge
}
