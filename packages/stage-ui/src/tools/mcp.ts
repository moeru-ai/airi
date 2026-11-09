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
}

/**
 * Runtime contract for wiring MCP tool discovery and execution into `stage-ui`.
 *
 * Use when:
 * - A concrete runtime such as Electron needs to provide MCP access without a singleton bridge
 *
 * Expects:
 * - `listTools` and `callTool` are safe to call multiple times
 *
 * Returns:
 * - An object that can back `createMcpTools`
 */
export interface McpToolRuntime {
  listTools: () => Promise<McpToolDescriptor[]>
  callTool: (payload: McpCallToolPayload, options?: McpExecutionOptions) => Promise<McpCallToolResult>
}

/** The proxy tool that calls an MCP tool. Each call names the MCP tool in its `name` argument, as `server::tool`. */
export const MCP_CALL_TOOL_NAME = 'builtIn_mcpCallTool'
export const MCP_LIST_TOOL_NAME = 'builtIn_mcpListTools'

/** Optional tool metadata cannot hold registration until a remote server's request deadline. */
const indexTimeoutMs = 1000
const unavailableIndex = 'The registration tool index is unavailable. Call this tool to discover the current catalog.'

/**
 * Creates MCP proxy tools backed by a runtime-provided transport.
 *
 * Discovery returns descriptors, an explicit empty-catalog message, or an MCP
 * error result. Runtime owners register these tools in the shared LLM tool store.
 * A registration-time server index helps models find connected capabilities.
 * Live discovery supplies current schemas. The index grants no execution authority.
 */
export async function createMcpTools(runtime: McpToolRuntime): Promise<Tool[]> {
  const catalog = runtime.listTools().then(
    tools => tools,
    () => undefined,
  )
  let timer: ReturnType<typeof setTimeout>
  const snapshot = await Promise.race([
    catalog,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(resolve, indexTimeoutMs, undefined)
    }),
  ]).finally(() => clearTimeout(timer))
  const visible = snapshot?.filter(tool => tool.exposure !== 'disabled')
  const servers = new Map<string, number>()
  for (const descriptor of visible ?? [])
    servers.set(descriptor.serverName, (servers.get(descriptor.serverName) ?? 0) + 1)
  const index = snapshot === undefined ? unavailableIndex : `Servers at registration: ${JSON.stringify([...servers].map(([name, tools]) => ({ name, tools })))}. Discovery returns the live catalog.`

  async function execute(payload: McpCallToolPayload, options?: McpExecutionOptions) {
    try {
      options?.abortSignal?.throwIfAborted()
      // Registration is a visibility hint. Main rechecks current admission without
      // making a Terminal call wait for discovery on unrelated MCP servers.
      if (snapshot?.some(tool => tool.name === payload.name && tool.exposure === 'disabled'))
        throw new Error(`MCP tool is unavailable or disabled: ${payload.name}`)
      return await runtime.callTool(payload, options)
    }
    catch (error) {
      return { isError: true, content: [{ type: 'text', text: errorMessageFrom(error) ?? 'Unknown error.' }] }
    }
  }

  return Promise.all([
    tool({
      name: MCP_LIST_TOOL_NAME,
      description: `List tools from connected MCP servers. Call this before builtIn_mcpCallTool to get current names and input schemas. For processes, CLI, files, and system interfaces, prefer Terminal, but do not call Terminal as a preflight. Reserve AUV for on-screen visual state or GUI interaction when the Host permits it. Prefer background application launches that avoid unrelated window changes. Never inject keyboard or mouse input through Shell to bypass AUV authorization. ${index}`,
      execute: async ({ name }) => {
        try {
          const tools = (await runtime.listTools()).filter(tool => tool.exposure !== 'disabled')
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
        try {
          options?.abortSignal?.throwIfAborted()
          const args = argsJson ? JSON.parse(argsJson) : {}
          return await execute({ name, arguments: args }, options)
        }
        catch (error) {
          return {
            isError: true,
            content: [{ type: 'text', text: errorMessageFrom(error) ?? 'Unknown error.' }],
          }
        }
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
    ...(visible ?? []).filter(descriptor => descriptor.exposure === 'direct').map(descriptor => rawTool({
      name: descriptor.toolName,
      description: descriptor.description ?? `Call ${descriptor.name} through the Host.`,
      parameters: descriptor.inputSchema,
      // MCP schemas retain their optional fields. Strict conversion can make them
      // required and nullable, although the server rejects null instead of omission.
      strict: false,
      execute: (arguments_, options?: McpExecutionOptions) => execute({ name: descriptor.name, arguments: arguments_ as Record<string, unknown> }, options),
    })),
  ])
}

/**
 * Omits MCP proxy tools from the default tool set because shared code has no MCP transport.
 *
 * Supported runtimes register {@link createMcpTools} results through `useLlmToolsStore`.
 */
export async function mcp(): Promise<Tool[]> {
  return []
}
