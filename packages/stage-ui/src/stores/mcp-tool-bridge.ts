export interface McpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

export interface McpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
}

interface McpToolBridge {
  listTools: () => Promise<McpToolDescriptor[]>
  callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>
}

let bridge: McpToolBridge | undefined

export function setMcpToolBridge(nextBridge: McpToolBridge) {
  bridge = nextBridge
}

export function clearMcpToolBridge() {
  bridge = undefined
}

export function getMcpToolBridge(): McpToolBridge {
  if (!bridge) {
    throw new Error('MCP tool bridge is not available in this runtime.')
  }

  return bridge
}
