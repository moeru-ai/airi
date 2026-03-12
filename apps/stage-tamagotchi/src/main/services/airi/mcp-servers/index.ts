import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ElectronMcpCallToolPayload,
  ElectronMcpCallToolResult,
  ElectronMcpStdioApplyResult,
  ElectronMcpStdioConfigFile,
  ElectronMcpStdioRuntimeStatus,
  ElectronMcpStdioServerConfig,
  ElectronMcpStdioServerRuntimeStatus,
  ElectronMcpToolDescriptor,
} from '../../../../shared/eventa'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { defineInvokeHandler } from '@moeru/eventa'
import { app, shell } from 'electron'
import { z } from 'zod'

import {
  electronMcpApplyAndRestart,
  electronMcpCallTool,
  electronMcpGetRuntimeStatus,
  electronMcpListTools,
  electronMcpOpenConfigFile,
  electronMcpToolsChangedEvent,
} from '../../../../shared/eventa'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

interface McpServerSession {
  client: Client
  transport: StdioClientTransport
  config: ElectronMcpStdioServerConfig
}

export interface McpStdioManager {
  ensureConfigFile: () => Promise<{ path: string }>
  openConfigFile: () => Promise<{ path: string }>
  applyAndRestart: () => Promise<ElectronMcpStdioApplyResult>
  listTools: () => Promise<ElectronMcpToolDescriptor[]>
  callTool: (payload: ElectronMcpCallToolPayload) => Promise<ElectronMcpCallToolResult>
  stopAll: () => Promise<void>
  getRuntimeStatus: () => ElectronMcpStdioRuntimeStatus
  /** Register a callback fired when any MCP server sends `notifications/tools/list_changed`. */
  onToolsChanged: (handler: (serverName: string) => void) => () => void
}

const mcpServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  enabled: z.boolean().optional(),
}).strict()

const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerConfigSchema),
}).strict()

const defaultMcpConfig: ElectronMcpStdioConfigFile = {
  mcpServers: {},
}
const toolNameSeparator = '::'
const mcpServerConnectTimeoutMsec = 10_000
const mcpListRequestTimeoutMsec = 10_000
const mcpListRequestMaxTotalTimeoutMsec = 15_000
// NOTICE: Agentic MCP tool calls may legitimately take longer than simple
// `tools/list` requests, especially when AIRI delegates to terminal workflows,
// browser agents, or multi-step browser/desktop tasks. A short 10-15s timeout
// causes false failures like `MCP error -32001: Request timed out` even though
// the tool is still progressing normally.
const mcpToolCallRequestTimeoutMsec = 60_000
const mcpToolCallMaxTotalTimeoutMsec = 180_000
const mcpToolRequestIdCacheTtlMsec = 30_000
const mcpToolRequestIdCacheMaxSize = 512

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
  const normalizedName = (() => {
    const trimmed = name.trim()
    if (trimmed.includes(toolNameSeparator)) {
      return trimmed
    }

    const dotSegments = trimmed.split('.')
    if (dotSegments.length === 2 && dotSegments.every(segment => segment.trim().length > 0)) {
      return `${dotSegments[0]}${toolNameSeparator}${dotSegments[1]}`
    }

    return trimmed
  })()

  const separatorIndex = normalizedName.indexOf(toolNameSeparator)
  if (separatorIndex <= 0 || separatorIndex === normalizedName.length - toolNameSeparator.length) {
    throw new Error(`invalid qualified tool name: ${name}`)
  }

  return {
    serverName: normalizedName.slice(0, separatorIndex),
    toolName: normalizedName.slice(separatorIndex + toolNameSeparator.length),
  }
}

async function findUniqueRunningServerForTool(params: {
  log: ReturnType<ReturnType<typeof useLogg>['useGlobalConfig']>
  requestedServerName: string
  sessions: Map<string, McpServerSession>
  toolName: string
}) {
  const matches: Array<{ serverName: string, session: McpServerSession }> = []
  const entries = [...params.sessions.entries()].sort(([left], [right]) => left.localeCompare(right))

  for (const [serverName, session] of entries) {
    try {
      const response = await session.client.listTools(undefined, {
        timeout: mcpListRequestTimeoutMsec,
        maxTotalTimeout: mcpListRequestMaxTotalTimeoutMsec,
      })

      if (response.tools.some(tool => tool.name === params.toolName)) {
        matches.push({ serverName, session })
      }
    }
    catch (error) {
      params.log.withFields({ serverName, requestedServerName: params.requestedServerName, toolName: params.toolName }).withError(error).warn('failed to inspect mcp server tools while resolving fallback tool call target')
    }
  }

  if (matches.length === 1) {
    // NOTICE: Some models occasionally invent placeholder namespaces like
    // `functions::terminal_exec` instead of the actual MCP server name.
    // When the requested server is missing but the tool exists on exactly one
    // running server, resolve it by tool name so the workflow can continue.
    params.log.withFields({
      requestedServerName: params.requestedServerName,
      resolvedServerName: matches[0].serverName,
      toolName: params.toolName,
    }).warn('resolved mcp tool call through fallback tool-name routing')
    return matches[0]
  }

  if (matches.length > 1) {
    throw new Error(`mcp server is not running: ${params.requestedServerName}; tool "${params.toolName}" exists on multiple running servers: ${matches.map(match => match.serverName).join(', ')}`)
  }

  return null
}

async function withTimeout<T>(task: Promise<T>, timeoutMsec: number, timeoutMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMsec)
      }),
    ])
  }
  finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function createSpawnEnv(overrides?: Record<string, string>): Record<string, string> {
  // NOTICE: MCP stdio servers are plain Node/CLI children, not nested Electron
  // processes. Forwarding Electron runtime env vars such as
  // `ELECTRON_RUN_AS_NODE` can subtly break native-module loading inside the
  // child process (for example `node-pty` in computer-use-mcp). Strip the
  // Electron-specific keys first, then layer explicit overrides back on top.
  const electronRuntimeEnvKeys = new Set([
    'APP_REMOTE_DEBUG',
    'APP_REMOTE_DEBUG_NO_OPEN',
    'APP_REMOTE_DEBUG_PORT',
    'ELECTRON_ENABLE_LOGGING',
    'ELECTRON_ENABLE_STACK_DUMPING',
    'ELECTRON_NO_ATTACH_CONSOLE',
    'ELECTRON_RUN_AS_NODE',
  ])
  const baseEnv = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string' && !electronRuntimeEnvKeys.has(entry[0])
    }),
  )
  if (!overrides) {
    return baseEnv
  }

  return {
    ...baseEnv,
    ...overrides,
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

export function createMcpStdioManager(): McpStdioManager {
  const log = useLogg('main/mcp-stdio').useGlobalConfig()
  const sessions = new Map<string, McpServerSession>()
  const runtimeStatuses = new Map<string, ElectronMcpStdioServerRuntimeStatus>()
  const inFlightToolCallsByRequestId = new Map<string, Promise<ElectronMcpCallToolResult>>()
  const completedToolCallsByRequestId = new Map<string, { result: ElectronMcpCallToolResult, expiresAt: number }>()
  const toolsChangedHandlers = new Set<(serverName: string) => void>()
  let updatedAt = Date.now()

  const pruneCompletedToolCalls = (now = Date.now()) => {
    for (const [requestId, cached] of completedToolCallsByRequestId.entries()) {
      if (cached.expiresAt <= now) {
        completedToolCallsByRequestId.delete(requestId)
      }
    }

    while (completedToolCallsByRequestId.size > mcpToolRequestIdCacheMaxSize) {
      const oldestRequestId = completedToolCallsByRequestId.keys().next().value
      if (!oldestRequestId) {
        break
      }
      completedToolCallsByRequestId.delete(oldestRequestId)
    }
  }

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
    const openResult = await shell.openPath(path)
    if (openResult) {
      throw new Error(openResult)
    }
    return { path }
  }

  const readConfigFile = async (path: string): Promise<ElectronMcpStdioConfigFile> => {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    const validated = mcpConfigSchema.safeParse(parsed)
    if (!validated.success) {
      throw new Error(validated.error.issues.map(issue => issue.message).join('; '))
    }
    return validated.data
  }

  const stopAll = async () => {
    const entries = [...sessions.entries()]
    for (const [name, session] of entries) {
      await closeSession(session)
      setRuntimeStatus({
        name,
        state: 'stopped',
        command: session.config.command,
        args: session.config.args ?? [],
        pid: null,
      })
      sessions.delete(name)
    }

    inFlightToolCallsByRequestId.clear()
    completedToolCallsByRequestId.clear()
  }

  const startServer = async (name: string, config: ElectronMcpStdioServerConfig) => {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: createSpawnEnv(config.env),
      cwd: config.cwd,
      stderr: 'pipe',
    })
    const client = new Client({
      name: `proj-airi:stage-tamagotchi:mcp:${name}`,
      version: app.getVersion(),
    }, {
      // NOTICE: When the MCP server advertises `tools.listChanged` capability
      // and sends `notifications/tools/list_changed`, the SDK will
      // auto-call `client.listTools()` and invoke `onChanged` with the
      // refreshed tool list. We forward this to our registered handlers
      // so the renderer can invalidate its cached tool snapshot.
      listChanged: {
        tools: {
          onChanged: (error) => {
            if (error) {
              log.withFields({ serverName: name }).withError(error).warn('tools list_changed refresh failed')
              return
            }
            log.withFields({ serverName: name }).log('tools list changed notification received')
            for (const handler of toolsChangedHandlers) {
              try {
                handler(name)
              }
              catch (handlerError) {
                log.withError(handlerError).warn('toolsChanged handler threw')
              }
            }
          },
        },
      },
    })

    try {
      await withTimeout(
        client.connect(transport),
        mcpServerConnectTimeoutMsec,
        `mcp server connect timeout (${mcpServerConnectTimeoutMsec}ms): ${name}`,
      )
      transport.stderr?.on('data', (data) => {
        const text = data.toString('utf-8').trim()
        if (text) {
          log.withFields({ serverName: name }).warn(text)
        }
      })
      sessions.set(name, { client, transport, config })
      setRuntimeStatus({
        name,
        state: 'running',
        command: config.command,
        args: config.args ?? [],
        pid: transport.pid,
      })
    }
    catch (error) {
      log.withFields({ serverName: name }).withError(error).warn('failed to connect mcp stdio server')
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
      path,
      started: [],
      failed: [],
      skipped: [],
    }

    for (const [name, server] of Object.entries(config.mcpServers)) {
      if (server.enabled === false) {
        result.skipped.push({ name, reason: 'disabled' })
        setRuntimeStatus({
          name,
          state: 'stopped',
          command: server.command,
          args: server.args ?? [],
          pid: null,
        })
        continue
      }

      try {
        await startServer(name, server)
        result.started.push({ name })
      }
      catch (error) {
        const message = stringifyError(error)
        result.failed.push({ name, error: message })
        setRuntimeStatus({
          name,
          state: 'error',
          command: server.command,
          args: server.args ?? [],
          pid: null,
          lastError: message,
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
          timeout: mcpListRequestTimeoutMsec,
          maxTotalTimeout: mcpListRequestMaxTotalTimeoutMsec,
        })
        return response.tools.map<ElectronMcpToolDescriptor>(item => ({
          serverName,
          name: `${serverName}${toolNameSeparator}${item.name}`,
          toolName: item.name,
          description: item.description,
          inputSchema: item.inputSchema,
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
    const normalizedRequestId = payload.requestId?.trim()
    if (normalizedRequestId) {
      pruneCompletedToolCalls()

      const cached = completedToolCallsByRequestId.get(normalizedRequestId)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result
      }

      const inFlight = inFlightToolCallsByRequestId.get(normalizedRequestId)
      if (inFlight) {
        return inFlight
      }
    }

    const executeCall = async (): Promise<ElectronMcpCallToolResult> => {
      const { serverName, toolName } = parseQualifiedToolName(payload.name)
      let resolvedServerName = serverName
      let session = sessions.get(serverName)
      if (!session) {
        const fallback = await findUniqueRunningServerForTool({
          log,
          requestedServerName: serverName,
          sessions,
          toolName,
        })

        if (!fallback) {
          throw new Error(`mcp server is not running: ${serverName}`)
        }

        resolvedServerName = fallback.serverName
        session = fallback.session
      }

      const forwardedArguments = {
        ...payload.arguments,
      }
      if (
        payload.approvalSessionId
        && resolvedServerName === 'computer_use'
        && toolName.startsWith('pty_')
        && typeof forwardedArguments.approvalSessionId !== 'string'
      ) {
        forwardedArguments.approvalSessionId = payload.approvalSessionId
      }

      const result = await session.client.callTool({
        name: toolName,
        arguments: forwardedArguments,
      }, undefined, {
        timeout: mcpToolCallRequestTimeoutMsec,
        maxTotalTimeout: mcpToolCallMaxTotalTimeoutMsec,
      })

      const normalized: ElectronMcpCallToolResult = {}
      if ('content' in result && Array.isArray(result.content)) {
        normalized.content = result.content as Array<Record<string, unknown>>
      }
      if ('structuredContent' in result) {
        normalized.structuredContent = result.structuredContent
      }
      if ('isError' in result && typeof result.isError === 'boolean') {
        normalized.isError = result.isError
      }
      if ('toolResult' in result) {
        normalized.toolResult = result.toolResult
      }

      if (resolvedServerName !== serverName) {
        normalized.structuredContent = {
          ...(typeof normalized.structuredContent === 'object' && normalized.structuredContent !== null
            ? normalized.structuredContent as Record<string, unknown>
            : {}),
          resolvedServerName,
          requestedServerName: serverName,
          toolName,
        }
      }

      return normalized
    }

    const execution = executeCall()
    if (!normalizedRequestId) {
      return execution
    }

    inFlightToolCallsByRequestId.set(normalizedRequestId, execution)

    try {
      const result = await execution
      const now = Date.now()
      completedToolCallsByRequestId.set(normalizedRequestId, {
        result,
        expiresAt: now + mcpToolRequestIdCacheTtlMsec,
      })
      pruneCompletedToolCalls(now)
      return result
    }
    finally {
      inFlightToolCallsByRequestId.delete(normalizedRequestId)
    }
  }

  const getRuntimeStatus = (): ElectronMcpStdioRuntimeStatus => {
    return {
      path: getConfigPath(),
      servers: [...runtimeStatuses.values()].sort((left, right) => left.name.localeCompare(right.name)),
      updatedAt,
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
    onToolsChanged: (handler: (serverName: string) => void) => {
      toolsChangedHandlers.add(handler)
      return () => {
        toolsChangedHandlers.delete(handler)
      }
    },
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

export function createMcpServersService(params: { context: ReturnType<typeof createContext>['context'], manager: McpStdioManager, allowManageConfig?: boolean }) {
  // NOTICE: Forward MCP `notifications/tools/list_changed` from any server to
  // all renderer windows so they can invalidate cached tool snapshots.
  params.manager.onToolsChanged((serverName) => {
    params.context.emit(electronMcpToolsChangedEvent, { serverName })
  })

  if (params.allowManageConfig) {
    defineInvokeHandler(params.context, electronMcpOpenConfigFile, async () => {
      return params.manager.openConfigFile()
    })

    defineInvokeHandler(params.context, electronMcpApplyAndRestart, async () => {
      return params.manager.applyAndRestart()
    })

    defineInvokeHandler(params.context, electronMcpGetRuntimeStatus, async () => {
      return params.manager.getRuntimeStatus()
    })
  }

  defineInvokeHandler(params.context, electronMcpListTools, async () => {
    return params.manager.listTools()
  })

  defineInvokeHandler(params.context, electronMcpCallTool, async (payload) => {
    return params.manager.callTool(payload)
  })
}
