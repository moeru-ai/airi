import { defineInvokeEventa } from '@moeru/eventa'

export interface ElectronMcpStdioServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

export interface ElectronMcpStdioConfigFile {
  mcpServers: Record<string, ElectronMcpStdioServerConfig>
}

export interface ElectronMcpStdioApplyResult {
  path: string
  started: Array<{ name: string }>
  failed: Array<{ name: string; error: string }>
  skipped: Array<{ name: string; reason: string }>
}

export interface ElectronMcpStdioServerRuntimeStatus {
  name: string
  state: 'running' | 'stopped' | 'error'
  command: string
  args: string[]
  pid: number | null
  lastError?: string
}

export interface ElectronMcpStdioRuntimeStatus {
  path: string
  servers: ElectronMcpStdioServerRuntimeStatus[]
  updatedAt: number
}

export interface ElectronMcpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface ElectronMcpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

export interface ElectronMcpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
}

export interface ElectronMcpStdioConfigText {
  path: string
  text: string
}

export interface ElectronMcpStdioTestResult {
  ok: boolean
  error?: string
  tools?: string[]
  durationMs: number
}

export interface ElectronMcpStdioTestPayload {
  name: string
  config: ElectronMcpStdioServerConfig
}

export const electronMcpOpenConfigFile = defineInvokeEventa<{ path: string }>(
  'eventa:invoke:electron:mcp:open-config-file',
)
export const electronMcpApplyAndRestart = defineInvokeEventa<ElectronMcpStdioApplyResult>(
  'eventa:invoke:electron:mcp:apply-and-restart',
)
export const electronMcpGetRuntimeStatus = defineInvokeEventa<ElectronMcpStdioRuntimeStatus>(
  'eventa:invoke:electron:mcp:get-runtime-status',
)
export const electronMcpListTools = defineInvokeEventa<ElectronMcpToolDescriptor[]>(
  'eventa:invoke:electron:mcp:list-tools',
)
export const electronMcpCallTool = defineInvokeEventa<ElectronMcpCallToolResult, ElectronMcpCallToolPayload>(
  'eventa:invoke:electron:mcp:call-tool',
)
export const electronMcpReadConfigText = defineInvokeEventa<ElectronMcpStdioConfigText>(
  'eventa:invoke:electron:mcp:read-config-text',
)
export const electronMcpWriteConfigText = defineInvokeEventa<ElectronMcpStdioConfigText, { text: string }>(
  'eventa:invoke:electron:mcp:write-config-text',
)
export const electronMcpTestServer = defineInvokeEventa<ElectronMcpStdioTestResult, ElectronMcpStdioTestPayload>(
  'eventa:invoke:electron:mcp:test-server',
)
