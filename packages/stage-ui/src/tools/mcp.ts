import { invoke } from '@tauri-apps/api/core'
import { tool } from '@xsai/tool'
import { z } from 'zod'

const tools = [
  tool({
    name: 'mcp_list_tools',
    description: 'List all tools available on the MCP server',
    execute: async (_, __) => {
      const tools = await invoke('list_tools')
      return tools
    },
    parameters: z.object({}),
    returns: z.object({}),
  }),
  tool({
    name: 'mcp_connect_server',
    description: 'Connect to the MCP server',
    execute: async (_, __) => {
      await invoke('connect_server')
      return 'success'
    },
    parameters: z.object({}),
    returns: z.object({}),
  }),
  tool({
    name: 'mcp_call_tool',
    description: 'Call a tool on the MCP server',
    execute: async ({ tool_name, parameters }) => {
      const result = await invoke('call_tool', {
        tool_name,
        parameters,
      })

      return result
    },
    parameters: z.object({
      tool_name: z.string().describe('The name of the tool to call'),
      parameters: z.any().describe('The parameters to pass to the tool'),
    }),
    returns: z.any().describe('The result of the tool call'),
  }),
]

export const mcp = async () => Promise.all(tools)
