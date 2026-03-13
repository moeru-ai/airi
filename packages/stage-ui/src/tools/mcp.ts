import type { CommonContentPart } from '@xsai/shared-chat'

import type { McpToolDescriptor } from '../stores/mcp-tool-bridge'

import { tool } from '@xsai/tool'
import { z } from 'zod'

import { getMcpToolBridge, normalizeQualifiedMcpToolName, onMcpToolsChanged } from '../stores/mcp-tool-bridge'
import {
  formatMcpToolListPromptContent,
  formatMcpToolResultPromptContent,
  formatRerouteObservation,
  getMcpPromptContentOptions,
} from './mcp-prompt-content'
import { extractWorkflowReroute } from './mcp-reroute'

const mcpParameterPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const mcpParameterValueSchema = z.union([
  mcpParameterPrimitiveSchema,
  z.array(mcpParameterPrimitiveSchema),
  z.object({}).catchall(mcpParameterPrimitiveSchema),
])

export interface McpToolOptions {
  approvalSessionId?: string
  promptContentMode?: 'default' | 'tight' | 'tight-text-only'
}

// NOTICE: Module-level cached tool list, eagerly refreshed when any MCP server
// reports a tool list change via `notifications/tools/list_changed`. Embedded
// in the mcp_call_tool description so the model always sees current tools
// without needing to call mcp_list_tools first on every conversation turn.
let cachedToolList: McpToolDescriptor[] | null = null
let cacheRefreshPromise: Promise<void> | null = null

function refreshToolListCache(): Promise<void> {
  if (cacheRefreshPromise)
    return cacheRefreshPromise

  let bridge
  try {
    bridge = getMcpToolBridge()
  }
  catch {
    // Bridge not available yet (e.g., during early initialization or in tests)
    return Promise.resolve()
  }

  cacheRefreshPromise = bridge.listTools()
    .then((tools) => {
      cachedToolList = tools
    })
    .catch((err) => {
      console.warn('[mcp] failed to refresh tool list cache:', err)
    })
    .finally(() => {
      cacheRefreshPromise = null
    })

  return cacheRefreshPromise
}

// Auto-refresh cache when MCP servers report tool list changes
onMcpToolsChanged(() => {
  refreshToolListCache()
})

/** Returns the current cached tool list snapshot (may be null if never fetched). */
export function getCachedMcpToolList(): McpToolDescriptor[] | null {
  return cachedToolList
}

/** Reset the cached tool list. Intended for tests only. */
export function resetMcpToolListCache(): void {
  cachedToolList = null
  cacheRefreshPromise = null
}

function buildToolErrorPromptContent(message: string): CommonContentPart[] {
  return [
    {
      type: 'text',
      text: `MCP tool call failed: ${message}`,
    },
  ]
}

function buildCallToolDescription(toolList: McpToolDescriptor[] | null): string {
  if (toolList && toolList.length > 0) {
    const names = toolList.map(t => t.name).join(', ')
    return `Call a tool on the MCP server. Currently available tools: [${names}]. Pass the qualified name as "<serverName>::<toolName>". If a model accidentally emits "<serverName>.<toolName>", AIRI will normalize it automatically. The result is a list of content and a boolean indicating whether the tool call is an error.`
  }

  return 'Call a tool on the MCP server. Call mcp_list_tools first to discover available tools. The result is a list of content and a boolean indicating whether the tool call is an error.'
}

export async function mcp(options?: McpToolOptions) {
  const approvalSessionId = options?.approvalSessionId
  const promptContentOptions = getMcpPromptContentOptions(options?.promptContentMode)

  // NOTICE: Bootstrap the cache synchronously once so the first tool-call
  // description is not empty. After that, refresh in the background so every
  // turn does not block on MCP tool discovery.
  if (cachedToolList === null) {
    await refreshToolListCache()
  }
  else {
    void refreshToolListCache()
  }

  return Promise.all([
    tool({
      name: 'mcp_list_tools',
      description: 'List all tools available on the connected MCP servers',
      execute: async (_, __) => {
        try {
          const tools = await getMcpToolBridge().listTools()
          cachedToolList = tools
          return formatMcpToolListPromptContent(tools)
        }
        catch (error) {
          console.warn('[mcp_list_tools] failed to list tools:', error)
          return buildToolErrorPromptContent(error instanceof Error ? error.message : String(error))
        }
      },
      parameters: z.object({}).strict(),
    }),
    tool({
      name: 'mcp_call_tool',
      description: buildCallToolDescription(cachedToolList),
      execute: async ({ name, parameters }, options) => {
        try {
          const parametersObject = Object.fromEntries(parameters.map(({ name, value }) => [name, value]))
          const normalizedToolName = normalizeQualifiedMcpToolName(name)
          const result = await getMcpToolBridge().callTool({
            name: normalizedToolName,
            arguments: parametersObject,
            ...(options?.toolCallId ? { requestId: options.toolCallId } : {}),
            ...(approvalSessionId ? { approvalSessionId } : {}),
          })

          // Dedicated reroute branch: workflow_reroute gets fixed-format
          // observation instead of generic tool-result formatting.
          const rerouteInstruction = extractWorkflowReroute(result)
          if (rerouteInstruction) {
            return formatRerouteObservation(rerouteInstruction)
          }

          return await formatMcpToolResultPromptContent(result, promptContentOptions)
        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return buildToolErrorPromptContent(message)
        }
      },
      parameters: z.object({
        name: z.string().describe('The qualified tool name to call. Prefer format "<serverName>::<toolName>"; AIRI also normalizes accidental "<serverName>.<toolName>" output from some models.'),
        parameters: z.array(z.object({
          name: z.string().describe('The name of the parameter'),
          value: mcpParameterValueSchema.describe('The value of the parameter'),
        }).strict()).describe('The parameters to pass to the tool'),
      }).strict(),
    }),
  ])
}
