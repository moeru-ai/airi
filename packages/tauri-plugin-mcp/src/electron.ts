import type { CallToolResult, Tool } from './index'

import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'

// Define Eventa invoke handlers using the same event names as in the main process
const mcpConnectServer = defineInvokeEventa<void, { command: string, args: string[] }>('eventa:invoke:electron:mcp:connect-server')
const mcpDisconnectServer = defineInvokeEventa<void>('eventa:invoke:electron:mcp:disconnect-server')
const mcpListTools = defineInvokeEventa<Tool[]>('eventa:invoke:electron:mcp:list-tools')
const mcpCallTool = defineInvokeEventa<CallToolResult, { name: string, args: Record<string, unknown> }>('eventa:invoke:electron:mcp:call-tool')

// Get the Eventa context for Electron
let cachedContext: ReturnType<typeof createContext>['context'] | null = null

function getElectronContext() {
  if (typeof window === 'undefined') {
    throw new TypeError('Electron context not available')
  }
  // Type assertion: window.electron is available in Electron runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const electronWindow = window as any
  if (!electronWindow.electron?.ipcRenderer) {
    throw new Error('Electron context not available')
  }
  if (!cachedContext) {
    cachedContext = createContext(electronWindow.electron.ipcRenderer).context
  }
  return cachedContext
}

export async function connectServer(command: string, args: string[]): Promise<void> {
  const invoke = defineInvoke(getElectronContext(), mcpConnectServer)
  await invoke({ command, args })
}

export async function disconnectServer(): Promise<void> {
  const invoke = defineInvoke(getElectronContext(), mcpDisconnectServer)
  await invoke()
}

export async function listTools(): Promise<Tool[]> {
  const invoke = defineInvoke(getElectronContext(), mcpListTools)
  return await invoke()
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const invoke = defineInvoke(getElectronContext(), mcpCallTool)
  return await invoke({ name, args })
}

export type { CallToolResult, Tool } from './index'
