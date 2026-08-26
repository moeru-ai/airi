import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ElectronMcpCallToolPayload,
  ElectronMcpCallToolResult,
  ElectronMcpStdioApplyResult,
  ElectronMcpStdioConfigFile,
  ElectronMcpStdioConfigText,
  ElectronMcpStdioRuntimeStatus,
  ElectronMcpStdioServerConfig,
  ElectronMcpStdioServerRuntimeStatus,
  ElectronMcpStdioTestPayload,
  ElectronMcpStdioTestResult,
  ElectronMcpToolDescriptor,
} from '../../../../shared/eventa'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { defineInvokeHandler } from '@moeru/eventa'
import { app, shell } from 'electron'

import {
  electronMcpApplyAndRestart,
  electronMcpCallTool,
  electronMcpGetRuntimeStatus,
  electronMcpListTools,
  electronMcpOpenConfigFile,
  electronMcpReadConfigText,
  electronMcpTestServer,
  electronMcpWriteConfigText,
} from '../../../../shared/eventa'
import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

export interface McpStdioManager {
  applyAndRestart: () => Promise<ElectronMcpStdioApplyResult>
  callTool: (payload: ElectronMcpCallToolPayload) => Promise<ElectronMcpCallToolResult>
  ensureConfigFile: () => Promise<{ path: string }>
  getRuntimeStatus: () => ElectronMcpStdioRuntimeStatus
  listTools: () => Promise<ElectronMcpToolDescriptor[]>
  openConfigFile: () => Promise<{ path: string }>
  readConfigText: () => Promise<ElectronMcpStdioConfigText>
  stopAll: () => Promise<void>
  testServer: (payload: ElectronMcpStdioTestPayload) => Promise<ElectronMcpStdioTestResult>
  writeConfigText: (text: string) => Promise<ElectronMcpStdioConfigText>
}

interface McpServerSession {
  client: Client
  config: ElectronMcpStdioServerConfig
  transport: StdioClientTransport
}

const defaultMcpConfig: ElectronMcpStdioConfigFile = {
  mcpServers: {},
}
const toolNameSeparator = '::'
const mcpRequestTimeoutMsec = 10_000
const mcpRequestMaxTotalTimeoutMsec = 15_000
const mcpTestStderrMaxChars = 16_000

export function createMcpServersService(params: { context: ReturnType<typeof createContext>['context'], manager: McpStdioManager }) {
  defineInvokeHandler(params.context, electronMcpOpenConfigFile, async () => {
    return params.manager.openConfigFile()
  })

  defineInvokeHandler(params.context, electronMcpApplyAndRestart, async () => {
    return params.manager.applyAndRestart()
  })

  defineInvokeHandler(params.context, electronMcpGetRuntimeStatus, async () => {
    return params.manager.getRuntimeStatus()
  })

  defineInvokeHandler(params.context, electronMcpListTools, async () => {
    return params.manager.listTools()
  })

  defineInvokeHandler(params.context, electronMcpCallTool, async (payload) => {
    return params.manager.callTool(payload)
  })

  defineInvokeHandler(params.context, electronMcpReadConfigText, async () => {
    return params.manager.readConfigText()
  })

  defineInvokeHandler(params.context, electronMcpWriteConfigText, async (payload) => {
    return params.manager.writeConfigText(payload.text)
  })

  defineInvokeHandler(params.context, electronMcpTestServer, async (payload) => {
    return params.manager.testServer(payload)
  })
}

export function createMcpStdioManager(): McpStdioManager {
  const log = useLogg('main/mcp-stdio').useGlobalConfig()
  const sessions = new Map<string, McpServerSession>()
  const runtimeStatuses = new Map<string, ElectronMcpStdioServerRuntimeStatus>()
  let updatedAt = Date.now()

  const setRuntimeStatus = (status: ElectronMcpStdioServerRuntimeStatus) => {
    runtimeStatuses.set(status.name, status)
    updatedAt = Date.now()
  }

  const ensureConfigFile = async () => {
    const path = getConfigPath()
    await mkdir(app.getPath('userData'), { recursive: true })

    try {
      await readFile(path, 'utf-8')
    }
    catch {
      await writeFile(path, `${JSON.stringify(defaultMcpConfig, null, 2)}\n`)
    }

    return { path }
  }

  const openConfigFile = async () => {
    const { path } = await ensureConfigFile()
    shell.showItemInFolder(path)
    return { path }
  }

  const readConfigFile = async (path: string): Promise<ElectronMcpStdioConfigFile> => {
    const raw = await readFile(path, 'utf-8')
    return parseElectronMcpConfigText(raw)
  }

  const stopAll = async () => {
    const entries = [...sessions.entries()]
    for (const [name, session] of entries) {
      await closeSession(session)
      setRuntimeStatus({
        args: session.config.args ?? [],
        command: session.config.command,
        name,
        pid: null,
        state: 'stopped',
      })
      sessions.delete(name)
    }
  }

  const startServer = async (name: string, config: ElectronMcpStdioServerConfig) => {
    const transport = new StdioClientTransport({
      args: config.args ?? [],
      command: config.command,
      cwd: config.cwd,
      env: config.env,
      stderr: 'pipe',
    })
    const client = new Client({
      name: `proj-airi:stage-tamagotchi:mcp:${name}`,
      version: app.getVersion(),
    })

    try {
      await client.connect(transport)
      transport.stderr?.on('data', (data) => {
        const text = data.toString('utf-8').trim()
        if (text) {
          log.withFields({ serverName: name }).warn(text)
        }
      })
      sessions.set(name, { client, config, transport })
      setRuntimeStatus({
        args: config.args ?? [],
        command: config.command,
        name,
        pid: transport.pid,
        state: 'running',
      })
    }
    catch (error) {
      await transport.close().catch(() => {})
      throw error
    }
  }

  const applyAndRestart = async (): Promise<ElectronMcpStdioApplyResult> => {
    const { path } = await ensureConfigFile()
    const config = await readConfigFile(path)

    await stopAll()
    runtimeStatuses.clear()

    const result: ElectronMcpStdioApplyResult = {
      failed: [],
      path,
      skipped: [],
      started: [],
    }

    for (const [name, server] of Object.entries(config.mcpServers)) {
      if (server.enabled === false) {
        result.skipped.push({ name, reason: 'disabled' })
        setRuntimeStatus({
          args: server.args ?? [],
          command: server.command,
          name,
          pid: null,
          state: 'stopped',
        })
        continue
      }

      try {
        await startServer(name, server)
        result.started.push({ name })
      }
      catch (error) {
        const message = stringifyError(error)
        result.failed.push({ error: message, name })
        setRuntimeStatus({
          args: server.args ?? [],
          command: server.command,
          lastError: message,
          name,
          pid: null,
          state: 'error',
        })
      }
    }

    updatedAt = Date.now()

    return result
  }

  const listTools = async (): Promise<ElectronMcpToolDescriptor[]> => {
    const entries = [...sessions.entries()].sort(([left], [right]) => left.localeCompare(right))
    const listResult = await Promise.all(entries.map(async ([serverName, session]) => {
      try {
        const response = await session.client.listTools(undefined, {
          maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
          timeout: mcpRequestTimeoutMsec,
        })
        return response.tools.map<ElectronMcpToolDescriptor>(item => ({
          description: item.description,
          inputSchema: item.inputSchema,
          name: `${serverName}${toolNameSeparator}${item.name}`,
          serverName,
          toolName: item.name,
        }))
      }
      catch (error) {
        log.withFields({ serverName }).withError(error).warn('failed to list tools from mcp server')
        return []
      }
    }))

    return listResult.flat()
  }

  const callTool = async (payload: ElectronMcpCallToolPayload): Promise<ElectronMcpCallToolResult> => {
    const { serverName, toolName } = parseQualifiedToolName(payload.name)
    const session = sessions.get(serverName)
    if (!session) {
      throw new Error(`mcp server is not running: ${serverName}`)
    }

    let result
    try {
      result = await session.client.callTool({
        arguments: payload.arguments ?? {},
        name: toolName,
      }, undefined, {
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
        timeout: mcpRequestTimeoutMsec,
      })
    }
    catch (error) {
      const fallbackToolName = resolveFallbackToolName(toolName)
      if (!fallbackToolName || fallbackToolName === toolName) {
        throw error
      }

      log.withFields({
        fallbackToolName,
        requestedToolName: toolName,
        serverName,
      }).warn('retrying mcp tool call with normalized tool name')

      result = await session.client.callTool({
        arguments: payload.arguments ?? {},
        name: fallbackToolName,
      }, undefined, {
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
        timeout: mcpRequestTimeoutMsec,
      })
    }

    const normalized: ElectronMcpCallToolResult = {}
    if ('content' in result && Array.isArray(result.content)) {
      normalized.content = result.content as Array<Record<string, unknown>>
    }
    if ('structuredContent' in result && result.structuredContent && typeof result.structuredContent === 'object' && !Array.isArray(result.structuredContent)) {
      normalized.structuredContent = result.structuredContent as Record<string, unknown>
    }
    if ('isError' in result && typeof result.isError === 'boolean') {
      normalized.isError = result.isError
    }
    if ('toolResult' in result) {
      normalized.toolResult = result.toolResult
    }

    return normalized
  }

  const getRuntimeStatus = (): ElectronMcpStdioRuntimeStatus => {
    return {
      path: getConfigPath(),
      servers: [...runtimeStatuses.values()].sort((left, right) => left.name.localeCompare(right.name)),
      updatedAt,
    }
  }

  const readConfigText = async (): Promise<ElectronMcpStdioConfigText> => {
    const { path } = await ensureConfigFile()
    const text = await readFile(path, 'utf-8')
    return { path, text }
  }

  const writeConfigText = async (text: string): Promise<ElectronMcpStdioConfigText> => {
    const { path } = await ensureConfigFile()
    const validated = parseElectronMcpConfigText(text)
    const normalized = `${JSON.stringify(validated, null, 2)}\n`
    await writeFile(path, normalized)
    return { path, text: normalized }
  }

  const testServer = async (payload: ElectronMcpStdioTestPayload): Promise<ElectronMcpStdioTestResult> => {
    const startedAt = Date.now()
    let transport: null | StdioClientTransport = null
    let client: Client | null = null
    const stderrChunks: string[] = []

    const withDeadline = <V>(promise: Promise<V>, ms: number, label: string): Promise<V> => {
      let timer: NodeJS.Timeout | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      })
      return Promise.race([promise, timeout]).finally(() => {
        if (timer)
          clearTimeout(timer)
      })
    }

    try {
      transport = new StdioClientTransport({
        args: payload.config.args ?? [],
        command: payload.config.command,
        cwd: payload.config.cwd,
        env: payload.config.env,
        stderr: 'pipe',
      })
      client = new Client({
        name: `proj-airi:stage-tamagotchi:mcp:test:${payload.name}`,
        version: app.getVersion(),
      })

      transport.stderr?.on('data', (data) => {
        const text = data.toString('utf-8')
        if (text)
          stderrChunks.push(text)
      })

      await withDeadline(client.connect(transport), mcpRequestMaxTotalTimeoutMsec, 'connect')

      const response = await client.listTools(undefined, {
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
        timeout: mcpRequestTimeoutMsec,
      })

      if (stderrChunks.length > 0) {
        log.withFields({ serverName: payload.name }).debug(stderrChunks.join('').trim())
      }

      return {
        durationMs: Date.now() - startedAt,
        ok: true,
        tools: response.tools.map(tool => tool.name),
      }
    }
    catch (error) {
      const message = stringifyError(error)
      // Keep only the tail so a noisy failed server cannot flood the settings UI.
      const stderr = stderrChunks.join('').trim().slice(-mcpTestStderrMaxChars)
      return {
        durationMs: Date.now() - startedAt,
        error: stderr ? `${message}\n\n${stderr}` : message,
        ok: false,
      }
    }
    finally {
      if (client) {
        await client.close().catch(() => {})
      }
      if (transport) {
        await transport.close().catch(() => {})
      }
    }
  }

  return {
    applyAndRestart,
    callTool,
    ensureConfigFile,
    getRuntimeStatus,
    listTools,
    openConfigFile,
    readConfigText,
    stopAll,
    testServer,
    writeConfigText,
  }
}

export async function setupMcpStdioManager() {
  const log = useLogg('main/mcp-stdio').useGlobalConfig()
  const manager = createMcpStdioManager()

  onAppBeforeQuit(async () => {
    await manager.stopAll()
  })

  await manager.ensureConfigFile()

  try {
    await manager.applyAndRestart()
  }
  catch (error) {
    log.withError(error).warn('failed to apply mcp stdio config during startup')
  }

  return manager
}

async function closeSession(session: McpServerSession) {
  try {
    await session.client.close()
  }
  catch {
    await session.transport.close()
  }
}

function getConfigPath() {
  return join(app.getPath('userData'), 'mcp.json')
}

function parseQualifiedToolName(name: string) {
  const separatorIndex = name.indexOf(toolNameSeparator)
  if (separatorIndex <= 0 || separatorIndex === name.length - toolNameSeparator.length) {
    throw new Error(`invalid qualified tool name: ${name}`)
  }

  return {
    serverName: name.slice(0, separatorIndex),
    toolName: name.slice(separatorIndex + toolNameSeparator.length),
  }
}

function resolveFallbackToolName(toolName: string): string | undefined {
  const normalizedTransportPrefix = toolName
    .replace(/^\.(?:stdio|stdo)::/, '')
    .replace(/^(?:stdio|stdo)::/, '')
  if (normalizedTransportPrefix !== toolName) {
    return normalizedTransportPrefix
  }

  const lastSeparatorIndex = toolName.lastIndexOf(toolNameSeparator)
  if (lastSeparatorIndex <= 0 || lastSeparatorIndex === toolName.length - toolNameSeparator.length) {
    return undefined
  }

  return toolName.slice(lastSeparatorIndex + toolNameSeparator.length)
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
