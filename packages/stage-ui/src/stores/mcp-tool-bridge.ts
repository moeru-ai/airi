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
  requestId?: string
  approvalSessionId?: string
}

export interface McpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: unknown
  toolResult?: unknown
  isError?: boolean
  requestedServerName?: string
  resolvedServerName?: string
  resolvedToolName?: string
}

export function normalizeQualifiedMcpToolName(name: string): string {
  const normalized = name.trim()
  if (!normalized) {
    return normalized
  }

  if (normalized.includes('::')) {
    return normalized
  }

  const dotSegments = normalized.split('.')
  if (dotSegments.length === 2 && dotSegments.every(segment => segment.trim().length > 0)) {
    return `${dotSegments[0]}::${dotSegments[1]}`
  }

  return normalized
}

type ToolsChangedCallback = () => void

interface McpToolBridge {
  listTools: () => Promise<McpToolDescriptor[]>
  callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>
  /** Subscribe to tool-list-changed notifications from the main process. */
  onToolsChanged?: (callback: ToolsChangedCallback) => () => void
}

let bridge: McpToolBridge | undefined
const toolsChangedCallbacks = new Set<ToolsChangedCallback>()

export function setMcpToolBridge(nextBridge: McpToolBridge) {
  bridge = nextBridge
}

export function clearMcpToolBridge() {
  bridge = undefined
  toolsChangedCallbacks.clear()
}

export function getMcpToolBridge(): McpToolBridge {
  if (!bridge) {
    throw new Error('MCP tool bridge is not available in this runtime.')
  }

  return bridge
}

/**
 * Register a callback that fires when MCP servers report a tool list change.
 * Returns an unsubscribe function.
 */
export function onMcpToolsChanged(callback: ToolsChangedCallback): () => void {
  toolsChangedCallbacks.add(callback)
  return () => {
    toolsChangedCallbacks.delete(callback)
  }
}

/**
 * Notify all registered toolsChanged callbacks.
 * Called by the renderer bridge when it receives a push event from main.
 */
export function notifyMcpToolsChanged(): void {
  for (const callback of toolsChangedCallbacks) {
    try {
      callback()
    }
    catch (error) {
      console.warn('[mcp-tool-bridge] toolsChanged callback threw:', error)
    }
  }
}
