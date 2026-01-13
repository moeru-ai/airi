import { defineInvokeEventa } from '@moeru/eventa'

export interface McpTool {
  name: string
  description: string
  inputSchema: {
    required: string[]
    title: string
    type: 'object'
    properties: Record<string, {
      title: string
      type: string
      default?: any
    }>
  }
}

export interface McpCallToolResult {
  content: {
    type: string
    text: string
  }[]
  isError: boolean
}

const connectServer = defineInvokeEventa<void, { command: string, args: string[] }>('eventa:invoke:electron:mcp:connect-server')
const disconnectServer = defineInvokeEventa<void>('eventa:invoke:electron:mcp:disconnect-server')
const listTools = defineInvokeEventa<McpTool[]>('eventa:invoke:electron:mcp:list-tools')
const callTool = defineInvokeEventa<McpCallToolResult, { name: string, args: Record<string, unknown> }>('eventa:invoke:electron:mcp:call-tool')

export const mcp = {
  connectServer,
  disconnectServer,
  listTools,
  callTool,
}
