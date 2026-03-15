import { invoke } from '@tauri-apps/api/core'

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

export interface CallToolResult {
  content: {
    type: string
    text: string
  }[]
  isError: boolean
}

export interface Tool {
  name: string
  description: string
  inputSchema: ToolInputSchema
}

export async function connectServer(command: string, args: string[]) {
  await invoke('plugin:mcp|connect_server', { command, args })
}

export async function disconnectServer() {
  await invoke('plugin:mcp|disconnect_server')
}

export async function listTools(): Promise<Tool[]> {
  return await invoke('plugin:mcp|list_tools')
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return await invoke('plugin:mcp|call_tool', { name, args })
}
