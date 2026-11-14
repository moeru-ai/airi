import type { Tool } from '@xsai/shared-chat'

import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { z } from 'zod'

/**
 * Describes an MCP tool that can be exposed to the shared LLM runtime.
 *
 * Use when:
 * - A runtime needs to list available MCP tools before exposing them to models
 *
 * Expects:
 * - `name` is the fully-qualified tool name used for invocation
 *
 * Returns:
 * - The MCP tool descriptor metadata reported by the runtime
 */
export interface McpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

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
 * - `listTools` can be called multiple times
 * - Each `callTool` call can produce side effects. Do not retry when the outcome is unknown.
 *
 * Returns:
 * - An object that can back `createMcpTools`
 */
export interface McpToolRuntime {
  listTools: () => Promise<McpToolDescriptor[]>
  callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorResult(dispatchOutcome: McpDispatchOutcome, error: unknown): McpCallToolResult {
  return {
    dispatchOutcome,
    isError: true,
    content: [{ type: 'text', text: errorMessageFrom(error) ?? 'Unknown error.' }],
  }
}

/** The proxy tool that calls an MCP tool. Each call names the MCP tool in its `name` argument, as `server::tool`. */
export const MCP_CALL_TOOL_NAME = 'builtIn_mcpCallTool'

/**
 * Creates MCP proxy tools backed by a runtime-provided transport.
 *
 * Discovery returns descriptors, an explicit empty-catalog message, or an MCP
 * error result. Runtime owners register these tools in the shared LLM tool store.
 */
export function createMcpTools(runtime: McpToolRuntime): Array<Promise<Tool>> {
  return [
    tool({
      name: 'builtIn_mcpListTools',
      description: 'List all available MCP tools. Call this first to discover tool names before calling builtIn_mcpCallTool.',
      execute: async () => {
        try {
          const tools = await runtime.listTools()
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
      parameters: z.object({}).strict(),
    }),
    tool({
      name: MCP_CALL_TOOL_NAME,
      description: 'Call an MCP tool by name. Use builtIn_mcpListTools first to get available tool names.',
      execute: async ({ name, arguments: argsJson }) => {
        let args: Record<string, unknown> = {}
        try {
          const parsed = argsJson ? JSON.parse(argsJson) : {}
          if (!isJsonObject(parsed))
            return errorResult('failed_before_dispatch', new Error('MCP tool arguments must be a JSON object.'))
          args = parsed
        }
        catch (error) {
          return errorResult('failed_before_dispatch', error)
        }

        try {
          return await runtime.callTool({ name, arguments: args })
        }
        catch (error) {
          return errorResult('outcome_unknown', error)
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
