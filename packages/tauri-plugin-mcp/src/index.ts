// Re-export types for compatibility
export interface ToolInputSchema {
  required: string[]
  title: string
  type: 'object'
  properties: Record<string, {
    title: string
    type: string
    default?: any
  }>
}

export type CallToolResultContentPart
  = | { type: 'text', text: string }
    | { type: 'image', data: string, mimeType?: string }
    | { type: string, [key: string]: unknown }

export interface CallToolResult {
  content: CallToolResultContentPart[]
  isError: boolean
}

export interface Tool {
  name: string
  description: string
  inputSchema: ToolInputSchema
}

// Tauri plugin - uses Tauri invoke for all operations
let cachedInvokeModule: { invoke: typeof import('@tauri-apps/api/core').invoke } | null = null

async function getInvoke() {
  if (cachedInvokeModule) {
    return cachedInvokeModule.invoke
  }
  const invokeModule = await import('@tauri-apps/api/core')
  cachedInvokeModule = invokeModule
  return invokeModule.invoke
}

export async function connectServer(command: string, args: string[]): Promise<void> {
  const invoke = await getInvoke()
  await invoke('plugin:mcp|connect_server', { command, args })
}

export async function disconnectServer(): Promise<void> {
  const invoke = await getInvoke()
  await invoke('plugin:mcp|disconnect_server')
}

export async function listTools(): Promise<Tool[]> {
  const invoke = await getInvoke()
  return await invoke('plugin:mcp|list_tools')
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const invoke = await getInvoke()
  return await invoke('plugin:mcp|call_tool', { name, args })
}
