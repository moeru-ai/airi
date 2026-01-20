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

export type McpContentPart
  = | { type: 'text', text: string }
    | { type: 'image', data: string, mimeType?: string }
    | { type: string, [key: string]: unknown }

export interface McpCallToolResult {
  content: McpContentPart[]
  isError: boolean
}

const connectServer = defineInvokeEventa<string, { command: string, args: string[] }>('eventa:invoke:electron:mcp:connect-server')
const disconnectServer = defineInvokeEventa<void, { serverId: string }>('eventa:invoke:electron:mcp:disconnect-server')
const listTools = defineInvokeEventa<McpTool[], { serverId: string }>('eventa:invoke:electron:mcp:list-tools')
const callTool = defineInvokeEventa<McpCallToolResult, { serverId: string, name: string, args: Record<string, unknown> }>('eventa:invoke:electron:mcp:call-tool')

export const mcp = {
  connectServer,
  disconnectServer,
  listTools,
  callTool,
}
