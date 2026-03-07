import { tool } from '@xsai/tool'
import { z } from 'zod'

import { getMcpToolBridge } from '../stores/mcp-tool-bridge'

const mcpParameterPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const mcpParameterValueSchema = z.union([
  mcpParameterPrimitiveSchema,
  z.array(mcpParameterPrimitiveSchema),
  z.object({}).catchall(mcpParameterPrimitiveSchema),
])

const tools = [
  tool({
    name: 'mcp_list_tools',
    description: 'List all tools available on the connected MCP servers',
    execute: async (_, __) => {
      try {
        return await getMcpToolBridge().listTools()
      }
      catch (error) {
        console.warn('[mcp_list_tools] failed to list tools:', error)
        return []
      }
    },
    parameters: z.object({}).strict(),
  }),
  tool({
    name: 'mcp_call_tool',
    description: 'Call a tool on the MCP server. The result is a list of content and a boolean indicating whether the tool call is an error.',
    execute: async ({ name, parameters }, options) => {
      try {
        const parametersObject = Object.fromEntries(parameters.map(({ name, value }) => [name, value]))
        const result = await getMcpToolBridge().callTool({
          name,
          arguments: parametersObject,
          ...(options?.toolCallId ? { requestId: options.toolCallId } : {}),
        })
        return result satisfies {
          content?: Record<string, unknown>[]
          isError?: boolean
          structuredContent?: unknown
          toolResult?: unknown
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
        }
      }
    },
    parameters: z.object({
      name: z.string().describe('The qualified tool name to call. Use format "<serverName>::<toolName>"'),
      parameters: z.array(z.object({
        name: z.string().describe('The name of the parameter'),
        value: mcpParameterValueSchema.describe('The value of the parameter'),
      }).strict()).describe('The parameters to pass to the tool'),
    }).strict(),
  }),
]

export const mcp = async () => Promise.all(tools)
