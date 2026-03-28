import { tool } from '@xsai/tool'
import { z } from 'zod'

import { getMcpToolBridge } from '../stores/mcp-tool-bridge'

const tools = [
  tool({
    name: 'mcp_list_tools',
    description: 'List all available MCP tools. Call this first to discover tool names before calling mcp_call_tool.',
    execute: async () => {
      try {
        return await getMcpToolBridge().listTools()
      }
      catch (error) {
        console.warn('[mcp_list_tools] failed to list tools:', error)
        return ''
      }
    },
    parameters: z.object({}).strict(),
  }),
  tool({
    name: 'mcp_call_tool',
    description: 'Call an MCP tool by name. Use mcp_list_tools first to get available tool names.',
    execute: async ({ name, arguments: argsJson }) => {
      try {
        const args = argsJson ? JSON.parse(argsJson) : {}
        return await getMcpToolBridge().callTool({ name, arguments: args })
      }
      catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        }
      }
    },
    // NOTICE: `arguments` is z.string() (JSON) because z.unknown() produces `{}` (no `type` key)
    // and z.record() emits `propertyNames`, both rejected by OpenAI.
    parameters: z.object({
      name: z.string().describe('Tool name in "<serverName>::<toolName>" format'),
      arguments: z.string().describe('JSON object of tool arguments, e.g. {"query":"hello","limit":10}'),
    }).strict(),
  }),
]

export const mcp = async () => Promise.all(tools)
