import type { createContext, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

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

import process from 'node:process'

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
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
  readConfigText: () => Promise<ElectronMcpStdioConfigText>
  writeConfigText: (text: string) => Promise<ElectronMcpStdioConfigText>
  testServer: (payload: ElectronMcpStdioTestPayload) => Promise<ElectronMcpStdioTestResult>
}

const defaultMcpConfig: ElectronMcpStdioConfigFile = {
  mcpServers: {},
}
const toolNameSeparator = '::'
const mcpRequestTimeoutMsec = 10_000
const mcpRequestMaxTotalTimeoutMsec = 15_000
const mcpTestStderrMaxChars = 16_000
const mcpConfigFileMode = 0o600
const mcpListToolsMaxPerServer = 200
const mcpToolDescriptionMaxChars = 2_000
const mcpToolDescriptorMaxChars = 50_000
const mcpToolListTotalMaxChars = 1_000_000
const mcpToolResultMaxChars = 200_000
const mcpToolResultMaxItems = 50
const mcpToolResultTruncationSuffix = '\n[truncated by AIRI: result content was cut to fit the size budget]'
const mcpTextBlockOverheadChars = JSON.stringify({ type: 'text', text: '' }).length

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value
  }

  return `${value.slice(0, maxChars)}\n[truncated by AIRI: content exceeded ${maxChars} characters]`
}

/**
 * Bounds one MCP tool result before it reaches the renderer or the model.
 *
 * MCP servers are separate processes and can fail or misbehave. Without a cap,
 * one server could grow AIRI memory and the model context without limit.
 */
function boundMcpToolResult(result: ElectronMcpCallToolResult): ElectronMcpCallToolResult {
  const bounded: ElectronMcpCallToolResult = { ...result }
  const content = bounded.content

  if (content) {
    const items: Array<Record<string, unknown>> = []
    let remaining = mcpToolResultMaxChars

    for (const item of content) {
      if (items.length >= mcpToolResultMaxItems || remaining <= 0) {
        break
      }

      const text = typeof item.text === 'string' ? item.text : undefined
      if (item.type === 'text' && text !== undefined) {
        // Drop optional block fields such as `_meta` and charge the serialized
        // block, because extra fields can exceed the budget on their own.
        const maxTextChars = Math.max(0, remaining - mcpTextBlockOverheadChars)
        let boundedText = text.slice(0, maxTextChars)
        if (boundedText.length < text.length) {
          // Reserve room for the marker so the model knows the content was cut.
          const suffixBudget = Math.max(0, maxTextChars - mcpToolResultTruncationSuffix.length)
          let withSuffixText = `${text.slice(0, suffixBudget)}${mcpToolResultTruncationSuffix}`
          let withSuffixChars = JSON.stringify({ type: 'text', text: withSuffixText })?.length ?? 0
          if (withSuffixChars > remaining) {
            // JSON escaping can add characters; trim the overflow before the
            // final budget check.
            const overflow = withSuffixChars - remaining
            withSuffixText = `${text.slice(0, Math.max(0, suffixBudget - overflow))}${mcpToolResultTruncationSuffix}`
            withSuffixChars = JSON.stringify({ type: 'text', text: withSuffixText })?.length ?? 0
          }
          if (withSuffixChars <= remaining) {
            boundedText = withSuffixText
          }
        }

        const textBlock = { type: 'text', text: boundedText }
        const textBlockChars = JSON.stringify(textBlock)?.length ?? 0
        if (textBlockChars > remaining) {
          break
        }

        items.push(textBlock)
        remaining -= textBlockChars
        continue
      }

      const serializedLength = JSON.stringify(item)?.length ?? 0
      if (serializedLength > remaining) {
        break
      }

      items.push(item)
      remaining -= serializedLength
    }

    if (items.length < content.length) {
      items.push({
        type: 'text',
        text: `[truncated by AIRI: this result exceeded ${mcpToolResultMaxChars} characters or ${mcpToolResultMaxItems} items]`,
      })
    }

    bounded.content = items
  }

  if (bounded.toolResult !== undefined && (JSON.stringify(bounded.toolResult)?.length ?? 0) > mcpToolResultMaxChars) {
    delete bounded.toolResult
  }
  if (bounded.structuredContent && (JSON.stringify(bounded.structuredContent)?.length ?? 0) > mcpToolResultMaxChars) {
    delete bounded.structuredContent
  }

  return bounded
}

function getConfigPath() {
  return join(app.getPath('userData'), 'mcp.json')
}

/**
 * Writes the MCP config with owner-only permissions.
 *
 * The file can hold API keys in `env`, so it must not stay group or world
 * readable on POSIX systems. `chmod` also tightens files created by older
 * builds, because `mode` only applies when `writeFile` creates the file.
 */
async function writeConfigFile(path: string, contents: string) {
  await writeFile(path, contents, { mode: mcpConfigFileMode })
  if (process.platform !== 'win32') {
    await chmod(path, mcpConfigFileMode)
  }
}

/**
 * Rejects MCP IPC commands that do not come from an app window main frame.
 *
 * Every app window shares the preload IPC bridge, while sandboxed plugin
 * iframes have no bridge at all. This guard keeps subframes and foreign frames
 * out of the MCP read, write, and process-spawn operations.
 */
function assertTrustedMcpSender(options: { raw?: ElectronMainEmitOptions['raw'] } | undefined) {
  const event = options?.raw?.ipcMainEvent
  if (!event) {
    // In-memory contexts carry no IPC frame; only tests use them.
    return
  }

  const frame = event.senderFrame
  // Only the top frame of an app window may drive MCP. `parent` is null for a
  // main frame; subframes and disposed frames are rejected.
  if (!frame || frame.parent !== null) {
    throw new Error('Rejected MCP command from an untrusted frame.')
  }
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
      await writeConfigFile(path, `${JSON.stringify(defaultMcpConfig, null, 2)}\n`)
      return { path }
    }

    // Files created by older builds can stay world readable. Tighten them here
    // as well, because a read path never calls `writeConfigFile`.
    if (process.platform !== 'win32') {
      try {
        await chmod(path, mcpConfigFileMode)
      }
      catch (error) {
        log.withError(error).withFields({ path }).warn('failed to tighten mcp config permissions')
      }
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
        name,
        state: 'stopped',
        command: session.config.command,
        args: session.config.args ?? [],
        pid: null,
      })
      sessions.delete(name)
    }
  }

  const startServer = async (name: string, config: ElectronMcpStdioServerConfig) => {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      cwd: config.cwd,
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
          timeout: mcpRequestTimeoutMsec,
          maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
        })
        const descriptors: ElectronMcpToolDescriptor[] = []
        let totalChars = 0

        for (const item of response.tools.slice(0, mcpListToolsMaxPerServer)) {
          const descriptor = {
            serverName,
            name: `${serverName}${toolNameSeparator}${item.name}`,
            toolName: item.name,
            description: item.description ? truncateText(item.description, mcpToolDescriptionMaxChars) : item.description,
            inputSchema: item.inputSchema,
          } satisfies ElectronMcpToolDescriptor

          // Names and input schemas are unbounded server output too, so apply a
          // serialized-size budget to each descriptor and to the whole list.
          const descriptorChars = JSON.stringify(descriptor)?.length ?? 0
          if (descriptorChars > mcpToolDescriptorMaxChars || totalChars + descriptorChars > mcpToolListTotalMaxChars) {
            log.withFields({ serverName, toolName: item.name }).warn('skipping mcp tool with oversized descriptor')
            continue
          }

          descriptors.push(descriptor)
          totalChars += descriptorChars
        }

        return descriptors
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
        name: toolName,
        arguments: payload.arguments ?? {},
      }, undefined, {
        timeout: mcpRequestTimeoutMsec,
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
      })
    }
    catch (error) {
      const fallbackToolName = resolveFallbackToolName(toolName)
      if (!fallbackToolName || fallbackToolName === toolName) {
        throw error
      }

      log.withFields({
        serverName,
        requestedToolName: toolName,
        fallbackToolName,
      }).warn('retrying mcp tool call with normalized tool name')

      result = await session.client.callTool({
        name: fallbackToolName,
        arguments: payload.arguments ?? {},
      }, undefined, {
        timeout: mcpRequestTimeoutMsec,
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
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

    return boundMcpToolResult(normalized)
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
    await writeConfigFile(path, normalized)
    return { path, text: normalized }
  }

  const testServer = async (payload: ElectronMcpStdioTestPayload): Promise<ElectronMcpStdioTestResult> => {
    const startedAt = Date.now()
    let transport: StdioClientTransport | null = null
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
        command: payload.config.command,
        args: payload.config.args ?? [],
        env: payload.config.env,
        cwd: payload.config.cwd,
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

export function createMcpServersService(params: { context: ReturnType<typeof createContext>['context'], manager: McpStdioManager }) {
  defineInvokeHandler(params.context, electronMcpOpenConfigFile, async (_payload, options) => {
    assertTrustedMcpSender(options)
    return params.manager.openConfigFile()
  })

  defineInvokeHandler(params.context, electronMcpApplyAndRestart, async (_payload, options) => {
    assertTrustedMcpSender(options)
    return params.manager.applyAndRestart()
  })

  defineInvokeHandler(params.context, electronMcpGetRuntimeStatus, async (_payload, options) => {
    assertTrustedMcpSender(options)
    return params.manager.getRuntimeStatus()
  })

  defineInvokeHandler(params.context, electronMcpListTools, async (_payload, options) => {
    assertTrustedMcpSender(options)
    return params.manager.listTools()
  })

  defineInvokeHandler(params.context, electronMcpCallTool, async (payload, options) => {
    assertTrustedMcpSender(options)
    return params.manager.callTool(payload)
  })

  defineInvokeHandler(params.context, electronMcpReadConfigText, async (_payload, options) => {
    assertTrustedMcpSender(options)
    return params.manager.readConfigText()
  })

  defineInvokeHandler(params.context, electronMcpWriteConfigText, async (payload, options) => {
    assertTrustedMcpSender(options)
    return params.manager.writeConfigText(payload.text)
  })

  defineInvokeHandler(params.context, electronMcpTestServer, async (payload, options) => {
    assertTrustedMcpSender(options)
    return params.manager.testServer(payload)
  })
}
