import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ElectronMcpApplyResult,
  ElectronMcpCallToolPayload,
  ElectronMcpCallToolResult,
  ElectronMcpConfigFile,
  ElectronMcpConfigText,
  ElectronMcpRuntimeStatus,
  ElectronMcpServerConfig,
  ElectronMcpServerRuntimeStatus,
  ElectronMcpTestPayload,
  ElectronMcpTestResult,
  ElectronMcpToolDescriptor,
} from '../../../../shared/eventa'
import type { TerminalApprovalOptions } from './terminal-approval'

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { env, execPath } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { bundledTerminalServerName, terminalControlEnabledEnv, terminalControlNonceEnv, terminalOriginMetaKey } from '@proj-airi/stage-shared/terminal-approval'
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
import { isHttpServerConfig, parseElectronMcpConfigText } from '../../../../shared/mcp-config'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { requireMainFrameSender } from '../../../libs/electron/window-context'
import { validateAttribution } from '../computer-use/attribution'
import { McpClient } from './client'
import { bindTerminalApproval } from './terminal-approval'

/** A transport that the MCP client can drive. Both kinds expose `close`. */
type McpTransport = StdioClientTransport | StreamableHTTPClientTransport

interface McpServerSession {
  client: Client
  transport: McpTransport
  config: ElectronMcpServerConfig
  terminalNonce?: string
}

export interface McpManager {
  ensureConfigFile: () => Promise<{ path: string }>
  openConfigFile: () => Promise<{ path: string }>
  applyAndRestart: () => Promise<ElectronMcpApplyResult>
  /** Returns the current catalog, or a descriptor from only the named server for an exact tool name. */
  listTools: (name?: string) => Promise<ElectronMcpToolDescriptor[]>
  /** Dispatches the exact tool name once. A failed reply does not prove the absence of effects. */
  callTool: (payload: ElectronMcpCallToolPayload, senderWebContentsId?: number, signal?: AbortSignal) => Promise<ElectronMcpCallToolResult>
  stopAll: () => Promise<void>
  getRuntimeStatus: () => ElectronMcpRuntimeStatus
  readConfigText: () => Promise<ElectronMcpConfigText>
  writeConfigText: (text: string) => Promise<ElectronMcpConfigText>
  testServer: (payload: ElectronMcpTestPayload) => Promise<ElectronMcpTestResult>
}

const toolNameSeparator = '::'
const mcpRequestTimeoutMsec = 10_000
const mcpRequestMaxTotalTimeoutMsec = 15_000
const mcpTestStderrMaxChars = 16_000

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
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

async function closeSession(session: McpServerSession) {
  try {
    await session.client.close()
  }
  catch {
    await session.transport.close()
  }
}

/**
 * Creates the transport for one server configuration.
 *
 * Use when:
 * - Starting a server from `mcp.json` or from a connection test
 *
 * Expects:
 * - `config` already passed the MCP config schema
 *
 * Returns:
 * - A stdio transport that spawns `config.command`, or a streamable HTTP
 *   transport that reaches `config.url` and sends `config.headers` on every request
 */
function createTransport(config: ElectronMcpServerConfig): McpTransport {
  if (isHttpServerConfig(config)) {
    return new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers: config.headers },
    })
  }

  return new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: config.env,
    cwd: config.cwd,
    stderr: 'pipe',
  })
}

/**
 * Builds the runtime status row for one server.
 *
 * Use when:
 * - Recording that a server started, stopped, or failed
 *
 * Expects:
 * - `config` already passed the MCP config schema
 * - `options.pid` is known for stdio servers only
 *
 * Returns:
 * - A status that reports a process for stdio servers and an endpoint for HTTP servers
 */
function describeRuntime(
  name: string,
  config: ElectronMcpServerConfig,
  state: ElectronMcpServerRuntimeStatus['state'],
  options: { pid?: number | null, lastError?: string } = {},
): ElectronMcpServerRuntimeStatus {
  const lastError = options.lastError === undefined ? {} : { lastError: options.lastError }

  if (isHttpServerConfig(config)) {
    return { name, state, transport: 'http', url: config.url, ...lastError }
  }

  return {
    name,
    state,
    transport: 'stdio',
    command: config.command,
    args: config.args ?? [],
    pid: options.pid ?? null,
    ...lastError,
  }
}

/**
 * Owns MCP sessions and runtime status in the main process.
 * `applyAndRestart` replaces the sessions from disk. `stopAll` closes them.
 * Discovery returns a complete catalog or rejects with all server failures.
 */
export function createMcpManager(terminalApproval?: TerminalApprovalOptions): McpManager {
  const log = useLogg('main/mcp').useGlobalConfig()
  const sessions = new Map<string, McpServerSession>()
  const runtimeStatuses = new Map<string, ElectronMcpServerRuntimeStatus>()
  let updatedAt = Date.now()

  const setRuntimeStatus = (status: ElectronMcpServerRuntimeStatus) => {
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
      const defaultMcpConfig: ElectronMcpConfigFile = {
        ...(app.isPackaged && env.AIRI_DISTRIBUTION === 'terminal-beta' ? { terminalEnabled: true } : {}),
        mcpServers: {},
      }
      await writeFile(path, `${JSON.stringify(defaultMcpConfig, null, 2)}\n`)
    }

    return { path }
  }

  const openConfigFile = async () => {
    const { path } = await ensureConfigFile()
    shell.showItemInFolder(path)
    return { path }
  }

  const readConfigFile = async (path: string): Promise<ElectronMcpConfigFile> => {
    const raw = await readFile(path, 'utf-8')
    return parseElectronMcpConfigText(raw)
  }

  const stopAll = async () => {
    const entries = [...sessions.entries()]
    for (const [name, session] of entries) {
      await closeSession(session)
      setRuntimeStatus(describeRuntime(name, session.config, 'stopped'))
      sessions.delete(name)
    }
  }

  const startServer = async (name: string, config: ElectronMcpServerConfig) => {
    const terminalNonce = !isHttpServerConfig(config) && config.env?.[terminalControlEnabledEnv] === '1' && terminalApproval ? randomBytes(32).toString('hex') : undefined
    const controlledConfig = terminalNonce && !isHttpServerConfig(config) ? { ...config, env: { ...config.env, [terminalControlNonceEnv]: terminalNonce } } : config
    const transport = createTransport(controlledConfig)
    const client = new McpClient({
      name: `proj-airi:stage-tamagotchi:mcp:${name}`,
      version: app.getVersion(),
    })

    try {
      await client.connect(transport)
      if (transport instanceof StdioClientTransport) {
        transport.stderr?.on('data', (data) => {
          const text = data.toString('utf-8').trim()
          if (text) {
            log.withFields({ serverName: name }).warn(text)
          }
        })
      }
      const session: McpServerSession = { client, transport, config, terminalNonce }
      sessions.set(name, session)
      client.onclose = () => {
        if (sessions.get(name) !== session)
          return
        sessions.delete(name)
        setRuntimeStatus(describeRuntime(name, config, 'stopped'))
      }
      client.onerror = (error) => {
        if (sessions.get(name) === session)
          setRuntimeStatus(describeRuntime(name, config, 'error', { lastError: stringifyError(error) }))
      }
      setRuntimeStatus(describeRuntime(name, config, 'running', {
        pid: transport instanceof StdioClientTransport ? transport.pid : null,
      }))
    }
    catch (error) {
      await transport.close().catch(() => {})
      throw error
    }
  }

  const applyAndRestart = async (): Promise<ElectronMcpApplyResult> => {
    const { path } = await ensureConfigFile()
    const config = await readConfigFile(path)
    const servers = { ...config.mcpServers }
    if (config.terminalEnabled) {
      if (bundledTerminalServerName in servers)
        throw new Error(`The server name "${bundledTerminalServerName}" is reserved for the bundled Terminal. Rename the external server or disable the bundled Terminal.`)
      servers[bundledTerminalServerName] = {
        command: execPath,
        args: [join(app.getAppPath(), 'out', 'bundle', 'main', 'terminal.mjs')],
        cwd: app.getPath('userData'),
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          [terminalControlEnabledEnv]: '1',
          COMPUTER_USE_APPROVAL_MODE: 'actions',
          COMPUTER_USE_EXECUTOR: 'dry-run',
          COMPUTER_USE_BROWSER_DOM_BRIDGE_ENABLED: 'false',
          COMPUTER_USE_DEFAULT_CAPTURE_AFTER: 'false',
          COMPUTER_USE_SESSION_ROOT: join(app.getPath('userData'), 'terminal-sessions'),
        },
      }
    }

    await stopAll()
    runtimeStatuses.clear()

    const result: ElectronMcpApplyResult = {
      path,
      started: [],
      failed: [],
      skipped: [],
    }

    for (const [name, server] of Object.entries(servers)) {
      if (server.enabled === false) {
        result.skipped.push({ name, reason: 'disabled' })
        setRuntimeStatus(describeRuntime(name, server, 'stopped'))
        continue
      }

      try {
        await startServer(name, server)
        result.started.push({ name })
      }
      catch (error) {
        const message = stringifyError(error)
        result.failed.push({ name, error: message })
        setRuntimeStatus(describeRuntime(name, server, 'error', { lastError: message }))
      }
    }

    updatedAt = Date.now()

    return result
  }

  // Only the bundled, nonce-bound server supplies a direct Terminal entry.
  // Its desktop placeholders cannot become an alternative observation or input surface.
  const exposureOf = (serverName: string, session: McpServerSession, toolName: string): ElectronMcpToolDescriptor['exposure'] => {
    if (serverName !== bundledTerminalServerName || !session.terminalNonce)
      return 'router-only'
    if (toolName.startsWith('desktop_'))
      return 'disabled'
    return toolName === 'terminal_exec' ? 'direct' : 'router-only'
  }

  const listTools = async (name?: string): Promise<ElectronMcpToolDescriptor[]> => {
    const target = name === undefined ? undefined : parseQualifiedToolName(name)
    const entries = [...sessions.entries()]
      .filter(([serverName]) => !target || target.serverName === serverName)
      .sort(([left], [right]) => left.localeCompare(right))
    const listResult = await Promise.allSettled(entries.map(async ([serverName, session]) => {
      const response = await session.client.listTools(undefined, {
        timeout: mcpRequestTimeoutMsec,
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
      })
      return response.tools.filter(item => !target || item.name === target.toolName).map<ElectronMcpToolDescriptor>(item => ({
        serverName,
        name: `${serverName}${toolNameSeparator}${item.name}`,
        toolName: item.name,
        description: item.description,
        inputSchema: item.inputSchema,
        exposure: exposureOf(serverName, session, item.name),
      }))
    }))
    const tools: ElectronMcpToolDescriptor[] = []
    const failures: Error[] = []

    // Each result matches the sorted session snapshot. A partial catalog must
    // not report successful discovery while a server's tools remain unknown.
    for (const [index, result] of listResult.entries()) {
      const [serverName, session] = entries[index]
      if (result.status === 'fulfilled') {
        if (sessions.get(serverName) === session) {
          setRuntimeStatus(describeRuntime(serverName, session.config, 'running', {
            pid: session.transport instanceof StdioClientTransport ? session.transport.pid : null,
          }))
        }
        tools.push(...result.value)
        continue
      }

      if (sessions.get(serverName) === session)
        setRuntimeStatus(describeRuntime(serverName, session.config, 'error', { lastError: stringifyError(result.reason) }))
      log.withFields({ serverName }).withError(result.reason).warn('failed to list tools from mcp server')
      failures.push(new Error(`MCP server "${serverName}": ${errorMessageFrom(result.reason) ?? 'Unknown error.'}`, { cause: result.reason }))
    }

    if (failures.length > 0)
      throw new AggregateError(failures, failures.map(error => error.message).join('\n'))

    return tools
  }

  const callTool = async (payload: ElectronMcpCallToolPayload, senderWebContentsId?: number, signal?: AbortSignal): Promise<ElectronMcpCallToolResult> => {
    const { serverName, toolName } = parseQualifiedToolName(payload.name)
    const session = sessions.get(serverName)
    if (!session) {
      throw new Error(`mcp server is not running: ${serverName}`)
    }
    if (exposureOf(serverName, session, toolName) === 'disabled')
      throw new Error(`MCP tool is disabled by the Host: ${payload.name}`)
    const nonce = toolName === 'terminal_exec' ? session.terminalNonce : undefined
    const requestId = payload.requestId
    const attribution = nonce && requestId ? validateAttribution(payload.attribution, senderWebContentsId) : undefined
    if (nonce) {
      if (!terminalApproval || !requestId || !attribution?.toolCallId)
        throw new Error('Terminal execution requires a normal Chat request registered by the Host.')
      terminalApproval.actions.validateRequest(requestId, attribution)
    }

    const result = await session.client.callTool({
      name: toolName,
      arguments: payload.arguments ?? {},
      ...(nonce ? { _meta: { [terminalOriginMetaKey]: { nonce, requestId, toolCallId: attribution?.toolCallId } } } : {}),
    }, undefined, {
      timeout: mcpRequestTimeoutMsec,
      maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
      ...(signal ? { signal } : {}),
    })

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

    if (nonce && attribution && terminalApproval && normalized.structuredContent?.status === 'approval_required') {
      return bindTerminalApproval({ options: terminalApproval, connection: { client: session.client, serverName, nonce, pid: session.transport instanceof StdioClientTransport ? session.transport.pid : null, isCurrent: () => sessions.get(serverName) === session }, payload, attribution, result: normalized })
    }
    return normalized
  }

  const getRuntimeStatus = (): ElectronMcpRuntimeStatus => {
    return {
      path: getConfigPath(),
      servers: [...runtimeStatuses.values()].sort((left, right) => left.name.localeCompare(right.name)),
      updatedAt,
    }
  }

  const readConfigText = async (): Promise<ElectronMcpConfigText> => {
    const { path } = await ensureConfigFile()
    const text = await readFile(path, 'utf-8')
    return { path, text }
  }

  const writeConfigText = async (text: string): Promise<ElectronMcpConfigText> => {
    const { path } = await ensureConfigFile()
    const validated = parseElectronMcpConfigText(text)
    const normalized = `${JSON.stringify(validated, null, 2)}\n`
    await writeFile(path, normalized)
    return { path, text: normalized }
  }

  const testServer = async (payload: ElectronMcpTestPayload): Promise<ElectronMcpTestResult> => {
    const startedAt = Date.now()
    let transport: McpTransport | null = null
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
      transport = createTransport(payload.config)
      client = new McpClient({
        name: `proj-airi:stage-tamagotchi:mcp:test:${payload.name}`,
        version: app.getVersion(),
      })

      if (transport instanceof StdioClientTransport) {
        transport.stderr?.on('data', (data) => {
          const text = data.toString('utf-8')
          if (text)
            stderrChunks.push(text)
        })
      }

      await withDeadline(client.connect(transport), mcpRequestMaxTotalTimeoutMsec, 'connect')

      const response = await client.listTools(undefined, {
        timeout: mcpRequestTimeoutMsec,
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
      })

      if (stderrChunks.length > 0) {
        log.withFields({ serverName: payload.name }).debug(stderrChunks.join('').trim())
      }

      return {
        ok: true,
        tools: response.tools.map(tool => tool.name),
        durationMs: Date.now() - startedAt,
      }
    }
    catch (error) {
      const message = stringifyError(error)
      // Keep only the tail so a noisy failed server cannot flood the settings UI.
      const stderr = stderrChunks.join('').trim().slice(-mcpTestStderrMaxChars)
      return {
        ok: false,
        error: stderr ? `${message}\n\n${stderr}` : message,
        durationMs: Date.now() - startedAt,
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
    ensureConfigFile,
    openConfigFile,
    applyAndRestart,
    listTools,
    callTool,
    stopAll,
    getRuntimeStatus,
    readConfigText,
    writeConfigText,
    testServer,
  }
}

export async function setupMcpManager(terminalApproval?: TerminalApprovalOptions) {
  const log = useLogg('main/mcp').useGlobalConfig()
  const manager = createMcpManager(terminalApproval)

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

export function createMcpServersService(params: { context: ReturnType<typeof createContext>['context'], manager: McpManager }) {
  defineInvokeHandler(params.context, electronMcpOpenConfigFile, async () => {
    return params.manager.openConfigFile()
  })

  defineInvokeHandler(params.context, electronMcpApplyAndRestart, async () => {
    return params.manager.applyAndRestart()
  })

  defineInvokeHandler(params.context, electronMcpGetRuntimeStatus, async () => {
    return params.manager.getRuntimeStatus()
  })

  defineInvokeHandler(params.context, electronMcpListTools, async (payload) => {
    return params.manager.listTools(payload?.name)
  })

  defineInvokeHandler(params.context, electronMcpCallTool, async (payload, options) => {
    return params.manager.callTool(payload, requireMainFrameSender(options).id, options?.abortController?.signal)
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
