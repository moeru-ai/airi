import type { CallToolResult, Tool } from './index'

import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'

// Define Eventa invoke handlers using the same event names as in the main process
const mcpConnectServer = defineInvokeEventa<string, { command: string, args: string[] }>('eventa:invoke:electron:mcp:connect-server')
const mcpDisconnectServer = defineInvokeEventa<void, { serverId: string }>('eventa:invoke:electron:mcp:disconnect-server')
const mcpListTools = defineInvokeEventa<Tool[], { serverId: string }>('eventa:invoke:electron:mcp:list-tools')
const mcpCallTool = defineInvokeEventa<CallToolResult, { serverId: string, name: string, args: Record<string, unknown> }>('eventa:invoke:electron:mcp:call-tool')

// Get the Eventa context for Electron
let cachedContext: ReturnType<typeof createContext>['context'] | null = null

function getElectronContext() {
  if (typeof window === 'undefined') {
    throw new TypeError('Electron context not available')
  }
  // Type assertion: window.electron is available in Electron runtime
  const electronWindow = window as any
  if (!electronWindow.electron?.ipcRenderer) {
    throw new Error('Electron context not available')
  }
  if (!cachedContext) {
    cachedContext = createContext(electronWindow.electron.ipcRenderer).context
  }
  return cachedContext
}

export async function connectServer(command: string, args: string[]): Promise<string> {
  const invoke = defineInvoke(getElectronContext(), mcpConnectServer)
  return await invoke({ command, args })
}

export async function disconnectServer(serverId: string): Promise<void> {
  const invoke = defineInvoke(getElectronContext(), mcpDisconnectServer)
  await invoke({ serverId })
}

export async function listTools(serverId: string): Promise<Tool[]> {
  const invoke = defineInvoke(getElectronContext(), mcpListTools)
  return await invoke({ serverId })
}

export async function callTool(serverId: string, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const invoke = defineInvoke(getElectronContext(), mcpCallTool)
  return await invoke({ serverId, name, args })
}

export type { CallToolResult, Tool } from './index'
