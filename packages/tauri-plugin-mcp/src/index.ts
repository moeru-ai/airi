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

// Platform detection and conditional exports
// In Electron, use Eventa-based implementation
// In Tauri, use Tauri invoke (legacy support)
// In web/other, these will throw (expected behavior)

async function isElectron(): Promise<boolean> {
  if (typeof window === 'undefined')
    return false
  // Check if we're in Electron by checking for the electron context
  try {
    return !!(window.electron?.ipcRenderer)
  }
  catch {
    return false
  }
}

async function isTauri(): Promise<boolean> {
  if (typeof window === 'undefined')
    return false
  try {
    // Check for Tauri by trying to access __TAURI_INTERNALS__
    return !!(window as any).__TAURI_INTERNALS__
  }
  catch {
    return false
  }
}

export async function connectServer(command: string, args: string[]): Promise<void> {
  if (await isElectron()) {
    const electronModule = await import('./electron')
    return electronModule.connectServer(command, args)
  }
  else if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:mcp|connect_server', { command, args })
  }
  else {
    throw new Error('MCP is only supported in Electron or Tauri environments')
  }
}

export async function disconnectServer(): Promise<void> {
  if (await isElectron()) {
    const electronModule = await import('./electron')
    return electronModule.disconnectServer()
  }
  else if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:mcp|disconnect_server')
  }
  else {
    throw new Error('MCP is only supported in Electron or Tauri environments')
  }
}

export async function listTools(): Promise<Tool[]> {
  if (await isElectron()) {
    const electronModule = await import('./electron')
    return electronModule.listTools()
  }
  else if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke('plugin:mcp|list_tools')
  }
  else {
    throw new Error('MCP is only supported in Electron or Tauri environments')
  }
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (await isElectron()) {
    const electronModule = await import('./electron')
    return electronModule.callTool(name, args)
  }
  else if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke('plugin:mcp|call_tool', { name, args })
  }
  else {
    throw new Error('MCP is only supported in Electron or Tauri environments')
  }
}
