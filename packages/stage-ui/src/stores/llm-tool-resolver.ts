import type { StreamOptions } from '@proj-airi/core-agent'
import type { WebSocketEvents } from '@proj-airi/server-sdk'
import type { Tool } from '@xsai/shared-chat'

import { uniqBy } from 'es-toolkit'

import { createSparkCommandTool, createWebSearchTools, debug, mcp } from '../tools'
import { useLlmToolsStore } from './llm-tools'
import { useModsServerChannelStore } from './mods/api/channel-server'
import { useWebSearchStore } from './modules/web-search'

type ToolSource = Tool[] | (() => Promise<Tool[]>)

/**
 * Overrides for resolving the complete LLM-visible tool list.
 *
 * Production callers normally pass only {@link customTools}; tests can inject
 * every source to exercise merge and precedence policy without real stores.
 */
export interface ResolveLlmToolsOptions {
  /**
   * MCP-backed built-in tools.
   *
   * @default mcp()
   */
  builtInTools?: ToolSource
  /**
   * Debug tools exposed to the LLM.
   *
   * @default debug()
   */
  debugTools?: ToolSource
  /**
   * Spark command tools. Supplying this also avoids creating the mods server
   * channel store.
   *
   * @default createSparkCommandTool(...)
   */
  sparkCommandTools?: ToolSource
  /**
   * Web search tools. Supplying this also avoids reading the web-search module
   * store; by default the tool is included only when a Tavily API key is
   * configured (a keyless search can only error).
   *
   * @default gated on useWebSearchStore().configured
   */
  webSearchTools?: ToolSource
  /**
   * Request-scoped tools from {@link StreamOptions.tools}. These are ordered
   * before active runtime tools so runtime registrations can intentionally
   * override a request tool with the same name.
   */
  customTools?: StreamOptions['tools']
  /**
   * Runtime-registered tools currently active in the LLM tool store. Supplying
   * this also avoids creating the LLM tool store.
   *
   * @default useLlmToolsStore().activeTools
   */
  activeTools?: Tool[]
}

/**
 * Reads the provider-visible name from an xsai tool.
 */
export function toolNameFrom(tool: Tool): string | undefined {
  const candidate = tool as Tool & {
    name?: string
    function?: {
      name?: string
    }
  }

  return candidate.function?.name ?? candidate.name
}

async function resolveToolSource(source: ToolSource): Promise<Tool[]> {
  return typeof source === 'function' ? await source() : source
}

async function resolveCustomTools(customTools: StreamOptions['tools']): Promise<Tool[]> {
  if (typeof customTools === 'function')
    return await customTools() ?? []

  return customTools ?? []
}

async function resolveActiveTools(activeTools?: Tool[]): Promise<Tool[]> {
  if (activeTools != null)
    return activeTools

  const llmToolsStore = useLlmToolsStore()
  await llmToolsStore.awaitPendingRegistrations()
  return llmToolsStore.activeTools
}

async function resolveSparkCommandTools(sparkCommandTools?: ToolSource): Promise<Tool[]> {
  if (sparkCommandTools != null)
    return resolveToolSource(sparkCommandTools)

  const modsServerChannelStore = useModsServerChannelStore()
  const sendSparkCommand = (command: WebSocketEvents['spark:command']) => {
    // TODO(@nekomeowww): instruct the LLM to understand what destination is.
    // Currently without skill like prompt injection, many issues occur.
    // destination mostly are wrong or hallucinated, we need to find a way to make it more reliable.
    //
    // For now, since destinations as array will always broadcast to all connected modules/agents, we can set it to
    // empty array to avoid wrong routing.
    command.destinations = []

    modsServerChannelStore.send({
      type: 'spark:command',
      data: command,
    })
  }

  return createSparkCommandTool({ sendSparkCommand })
}

async function resolveWebSearchTools(webSearchTools?: ToolSource): Promise<Tool[]> {
  if (webSearchTools != null)
    return resolveToolSource(webSearchTools)

  const webSearchStore = useWebSearchStore()
  // A keyless search can only ever error, so omit the tool until configured.
  if (!webSearchStore.configured)
    return []

  // Trim the key: `configured` is computed on the trimmed value, so a key pasted
  // with trailing whitespace/newline reads as ready but would 401 if sent raw.
  return createWebSearchTools({ apiKey: webSearchStore.apiKey.trim() })
}

/**
 * Resolves every tool visible to an LLM request.
 *
 * Runtime tools are placed last before de-duplication. The reverse/uniq/reverse
 * pass preserves the existing stable order while letting later runtime
 * registrations win when names collide with built-in or custom tools.
 */
export async function resolveLlmTools(options: ResolveLlmToolsOptions = {}): Promise<Tool[]> {
  const activeTools = await resolveActiveTools(options.activeTools)
  const [
    builtInTools,
    debugTools,
    sparkCommandTools,
    webSearchTools,
    customTools,
  ] = await Promise.all([
    resolveToolSource(options.builtInTools ?? mcp),
    resolveToolSource(options.debugTools ?? debug),
    resolveSparkCommandTools(options.sparkCommandTools),
    resolveWebSearchTools(options.webSearchTools),
    resolveCustomTools(options.customTools),
  ])

  return uniqBy(
    [
      ...builtInTools,
      ...debugTools,
      ...sparkCommandTools,
      ...webSearchTools,
      ...customTools,
      ...activeTools,
    ].toReversed(),
    tool => toolNameFrom(tool) ?? tool,
  ).toReversed()
}
