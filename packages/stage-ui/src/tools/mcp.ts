import type { Tool, ToolExecuteOptions } from '@xsai/shared-chat'

import type { ToolAttributionContext } from '../types/chat'
import type { McpToolDescriptor } from '../types/mcp'

import { errorMessageFrom } from '@moeru/std'
import { rawTool, tool } from '@xsai/tool'
import { z } from 'zod'

export type { McpToolDescriptor } from '../types/mcp'

/**
 * Payload for invoking an MCP tool through a runtime-specific transport.
 *
 * Use when:
 * - A runtime needs to forward a tool invocation into the MCP layer
 *
 * Expects:
 * - `name` matches a descriptor returned from `listTools`
 * - `arguments` is a JSON-compatible object when provided
 *
 * Returns:
 * - The MCP tool call input envelope
 */
export interface McpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

/** Application execution context. It is separate from the model-facing MCP argument JSON. */
export interface McpExecutionOptions extends ToolExecuteOptions {
  attribution?: ToolAttributionContext & { toolCallId?: string }
}

/** Describes whether the MCP transport returned a response for one call. */
export type McpDispatchOutcome = 'response_received' | 'failed_before_dispatch' | 'outcome_unknown'

/**
 * Result returned from an MCP tool invocation.
 *
 * Use when:
 * - An MCP runtime returns tool output back to the shared LLM layer
 *
 * Expects:
 * - Error responses set `isError` when the tool execution failed
 *
 * Returns:
 * - Structured and unstructured MCP tool output
 */
export interface McpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
  /** `outcome_unknown` means that the call can have produced an external side effect. */
  dispatchOutcome?: McpDispatchOutcome
}

/**
 * Runtime contract for wiring MCP tool discovery and execution into `stage-ui`.
 *
 * Use when:
 * - A concrete runtime such as Electron needs to provide MCP access without a singleton bridge
 *
 * Expects:
 * - `listTools` supports exact names when the transport can scope discovery
 * - The Host enforces tool availability and permission for each `callTool`
 * - Each `callTool` call can produce side effects. Do not retry when the outcome is unknown.
 *
 * Returns:
 * - An object that can back `createMcpTools`
 */
export interface McpToolRuntime {
  listTools: (name?: string) => Promise<McpToolDescriptor[]>
  callTool: (payload: McpCallToolPayload, options?: McpExecutionOptions) => Promise<McpCallToolResult>
}

function errorResult(dispatchOutcome: McpDispatchOutcome, error: unknown): McpCallToolResult {
  return {
    dispatchOutcome,
    isError: true,
    content: [{ type: 'text', text: errorMessageFrom(error) ?? 'Unknown error.' }],
  }
}

/**
 * Controls whether the generic MCP router is put in the model's default tool
 * catalog. Direct descriptors are independent from this setting.
 *
 * - `none`: do not register the generic list/call proxies.
 * - `explicit`: register them for Host-selected requests only.
 * - `active`: register them as ordinary model tools.
 */
export type McpProxyExposure = 'none' | 'explicit' | 'active'

/** Host-owned registration options for the shared MCP tool set. */
export interface McpToolRegistration {
  servers?: readonly string[]
  direct?: readonly McpToolDescriptor[]
  /** Limits secondary routing to the server names selected by the Host. */
  proxyServers?: readonly string[]
  /** @default 'none' */
  proxy?: McpProxyExposure
}

/** Tool metadata consumed by the shared LLM tool store. */
export interface McpRuntimeTool extends Tool {
  defaultActive?: boolean
  requiresExplicitSelection?: boolean
}

/** The proxy tool that calls an MCP tool. Each call names the MCP tool in its `name` argument, as `server::tool`. */
export const MCP_CALL_TOOL_NAME = 'builtIn_mcpCallTool'
export const MCP_LIST_TOOL_NAME = 'builtIn_mcpListTools'

function namespacedDirectToolName(serverName: string, toolName: string) {
  const name = `mcp__${serverName}__${toolName}`.replace(/[^\w-]/g, '_')
  if (name.length <= 64)
    return name

  let hash = 2166136261
  for (const character of `${serverName}::${toolName}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  const suffix = `_${(hash >>> 0).toString(36)}`
  return `${name.slice(0, 64 - suffix.length)}${suffix}`
}

/** Shared execution contract for Chat, background recipes, and Agent runs. */
export const MCP_AGENT_EXECUTION_PROMPT = [
  'When the user asks you to operate an application, game, browser, or desktop, act as an Agent.',
  'Use the available MCP tools to inspect the current state and perform the task.',
  'For games and GUI tasks, keep an observe, act, verify loop until the requested goal is complete or a concrete blocker remains.',
  'computer_act reports input delivery only. Pass its execution.executionId to computer_verify, and treat businessVerification.status as the only application-state result.',
  'The Agent runtime compacts conversation context. The bundled Computer Use path provides AUV desktop observation and input plus Terminal process control.',
  'Use stable computer_* and terminal_exec tools first. External MCP tools are Host-selected and can be injected on demand.',
  'Do not invent proxy calls when they are absent from the current catalog.',
  'Treat earlier assistant claims about capabilities as unverified. Read the current tool catalog and runtime capabilities before deciding what you can do.',
  'For a game task, check the Computer Use capabilities and take a small observable action before exploring mod frameworks or switching to a strategy-only reply.',
  'Treat capability lists as scoped facts. A supported-app list names apps accepted by desktop open and focus tools. It does not prove that an app is absent or cannot be launched.',
  'If a requested app is missing from that list, do not retry desktop open with guessed names. Inspect running processes and known install paths with available Terminal or process tools.',
  'Use paths from the user and prior observations before default install paths. If those paths fail, inspect registered app paths, Start Menu shortcuts, and known library roots before concluding that the app is missing.',
  'Use Terminal for bounded process, install-path, and file discovery after a desktop capability or action blocker. Never use it to emulate mouse or keyboard input or bypass Host approval.',
  'When the desktop executor reports dry-run, treat screenshots and window lists as non-live unless the result proves otherwise. Continue with non-GUI discovery and approved launch steps.',
  'Complete safe, authorized steps and verify their effects before you report a blocker for later gameplay.',
  'Do not claim that a requested app is unavailable or a game cannot be played based only on a supported-app list.',
  'Do not answer that you cannot act because this is a chat when a suitable tool is available.',
  'Work in small steps. Read each result before the next action.',
  'If an action requires Host approval, wait for the approval result and continue the same task after settlement.',
  'Apply these rules in Chat, background recipes, and Agent runs.',
  'Verify the requested outcome with an observation or a task-specific check before you report success.',
  'Do not repeat an action after a lost or unclear result. Inspect the current state first.',
  'If the required tool or permission is unavailable, report the concrete blocker after you inspect available tools.',
].join('\n')

/**
 * Creates MCP proxy tools backed by a runtime-provided transport.
 *
 * Discovery returns descriptors, an explicit empty-catalog message, or an MCP
 * error result. Runtime owners register these tools in the shared LLM tool store.
 * The host can supply connected server names and direct descriptors at registration.
 * The host can limit generic routing to external servers with `proxyServers`.
 * Live discovery supplies current schemas and never grants execution authority.
 * Generic list/call proxies are disabled by default. A Host that needs the
 * secondary route must opt into `proxy: 'explicit'` (Host-selected calls) or
 * `proxy: 'active'` (an intentionally model-visible route).
 */
export async function createMcpTools(runtime: McpToolRuntime, registration: McpToolRegistration = {}): Promise<McpRuntimeTool[]> {
  const index = registration?.servers?.length
    ? ` Servers at registration: ${JSON.stringify(registration.servers)}. Discovery returns the live catalog.`
    : ''
  const proxyServers = registration.proxyServers === undefined
    ? undefined
    : new Set(registration.proxyServers)

  function isProxyTarget(name: string) {
    if (!proxyServers)
      return true

    const separatorIndex = name.indexOf('::')
    return separatorIndex > 0 && proxyServers.has(name.slice(0, separatorIndex))
  }

  async function execute(payload: McpCallToolPayload, options?: McpExecutionOptions) {
    try {
      options?.abortSignal?.throwIfAborted()
      return await runtime.callTool(payload, options)
    }
    catch (error) {
      if (options?.abortSignal?.aborted)
        return errorResult('failed_before_dispatch', error)
      return errorResult('outcome_unknown', error)
    }
  }

  const proxies: McpRuntimeTool[] = registration.proxy && registration.proxy !== 'none'
    ? (await Promise.all([
        tool({
          name: MCP_LIST_TOOL_NAME,
          description: `List tools from connected MCP servers. Call this when the current direct tool catalog is insufficient. Use Computer Use tools for games, browsers, and GUI tasks. Use Terminal for processes, CLI, and files. Do not call Terminal as a preflight. Never inject keyboard or mouse input through Shell to bypass Host authorization.${index}`,
          execute: async ({ name }) => {
            try {
              if (name && !isProxyTarget(name))
                return { isError: true, content: [{ type: 'text', text: `MCP tool is unavailable or disabled: ${name}` }] }

              const tools = (await runtime.listTools(name || undefined))
                .filter(tool => tool.exposure !== 'disabled')
                .filter(tool => isProxyTarget(tool.name))
              if (name) {
                const selected = tools.find(tool => tool.name === name)
                return selected ? [selected] : { isError: true, content: [{ type: 'text', text: `MCP tool is unavailable or disabled: ${name}` }] }
              }
              if (tools.length === 0)
                return 'No MCP tools are available. Do not retry discovery during this assistant turn.'

              return tools
            }
            catch (error) {
              return {
                isError: true,
                content: [{ type: 'text', text: `MCP tool discovery failed: ${errorMessageFrom(error) ?? 'Unknown error.'}` }],
              }
            }
          },
          parameters: z.object({ name: z.string().nullish().describe('Exact server::tool name for one current schema. Use null for the current catalog.') }).strict(),
        }),
        tool({
          name: MCP_CALL_TOOL_NAME,
          description: 'Call an MCP tool by name. Use builtIn_mcpListTools first to get available tool names.',
          execute: async ({ name, arguments: argsJson }, options?: McpExecutionOptions) => {
            let args: Record<string, unknown> = {}
            try {
              options?.abortSignal?.throwIfAborted()
              if (!isProxyTarget(name)) {
                return errorResult('failed_before_dispatch', new Error(`MCP server is not available through secondary routing: ${name}`))
              }
              const parsed = argsJson ? JSON.parse(argsJson) : {}
              if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
                return errorResult('failed_before_dispatch', new Error('MCP tool arguments must be a JSON object.'))
              args = parsed
            }
            catch (error) {
              return errorResult('failed_before_dispatch', error)
            }

            return await execute({ name, arguments: args }, options)
          },
          // NOTICE:
          // OpenAI rejects the schemas that z.unknown() and z.record() produce here.
          // They omit `type` or include `propertyNames`, so arguments use a JSON string.
          // Source/context: @xsai/tool schema conversion and ./mcp.test.ts.
          // Removal condition: The schema conversion produces an object schema that OpenAI accepts.
          parameters: z.object({
            name: z.string().describe('Tool name in "<serverName>::<toolName>" format'),
            arguments: z.string().describe('JSON object of tool arguments, for example {"query":"hello","limit":10}'),
          }).strict(),
        }),
      ])).map((proxy) => {
        if (registration.proxy !== 'explicit')
          return proxy
        return { ...proxy, defaultActive: false, requiresExplicitSelection: true }
      })
    : []

  const directDescriptors = (registration.direct ?? []).filter(descriptor => descriptor.exposure === 'direct')
  const directNameCounts = new Map<string, number>()
  for (const descriptor of directDescriptors)
    directNameCounts.set(descriptor.toolName, (directNameCounts.get(descriptor.toolName) ?? 0) + 1)

  const directNames = new Map<McpToolDescriptor, string>()
  const usedDirectNames = new Set<string>()
  for (const descriptor of directDescriptors) {
    const baseName = directNameCounts.get(descriptor.toolName) === 1 && /^[\w-]{1,64}$/.test(descriptor.toolName)
      ? descriptor.toolName
      : namespacedDirectToolName(descriptor.serverName, descriptor.toolName)
    let directName = baseName
    let suffixIndex = 2
    while (usedDirectNames.has(directName)) {
      const suffix = `_${suffixIndex++}`
      directName = `${baseName.slice(0, 64 - suffix.length)}${suffix}`
    }
    usedDirectNames.add(directName)
    directNames.set(descriptor, directName)
  }

  const directTools = await Promise.all(directDescriptors.map(descriptor => rawTool({
    // Keep short names when unique. Use a provider-safe server-qualified name for collisions.
    name: directNames.get(descriptor)!,
    description: descriptor.description ?? `Call ${descriptor.name} through the Host.`,
    parameters: descriptor.inputSchema,
    // MCP schemas retain their optional fields. Strict conversion can make them
    // required and nullable, although the server rejects null instead of omission.
    strict: false,
    execute: (arguments_, options?: McpExecutionOptions) => execute({ name: descriptor.name, arguments: arguments_ as Record<string, unknown> }, options),
  })))

  return [
    ...proxies,
    ...directTools,
  ]
}

/**
 * Omits MCP proxy tools from the default tool set because shared code has no MCP transport.
 *
 * Supported runtimes register {@link createMcpTools} results through `useLlmToolsStore`.
 */
export async function mcp(): Promise<Tool[]> {
  return []
}
