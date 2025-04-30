import { callTool, connectServer, disconnectServer, listTools } from '@proj-airi/tauri-plugin-mcp'
import { tool } from '@xsai/tool'
import { z } from 'zod'

const tools = [
  tool({
    name: 'mcp_list_tools',
    description: 'List all tools available on the MCP server',
    execute: async (_, __) => {
      return await listTools()
    },
    parameters: z.object({}),
    returns: z.object({}),
  }),
  tool({
    name: 'mcp_connect_server',
    description: 'Connect to the MCP server',
    execute: async ({ command, args }) => {
      await connectServer(command, args)
      return 'success'
    },
    parameters: z.object({
      command: z.string().describe('The command to connect to the MCP server'),
      args: z.array(z.string()).describe('The arguments to pass to the MCP server'),
    }),
    returns: z.string().describe('If "success", the connection to the MCP server is successful. Otherwise, the connection fails.'),
  }),
  tool({
    name: 'mcp_disconnect_server',
    description: 'Disconnect from the MCP server',
    execute: async () => {
      await disconnectServer()
      return 'success'
    },
    parameters: z.object({}),
    returns: z.string().describe('If "success", the connection to the MCP server is successful. Otherwise, the connection fails.'),
  }),
  tool({
    name: 'mcp_call_tool',
    description: 'Call a tool on the MCP server',
    execute: async ({ name, parameters }) => {
      const parametersObject = Object.fromEntries(parameters.map(({ name, value }) => [name, value]))
      const result = await callTool(name, parametersObject)
      return result
    },
    parameters: z.object({
      name: z.string().describe('The name of the tool to call'),
      parameters: z.array(z.object({ // Why LLM cannot understand record type?
        name: z.string().describe('The name of the parameter'),
        value: z.any().describe('The value of the parameter'),
      })).describe('The parameters to pass to the tool'),
    }),
    returns: z.object({
      content: z.array(z.object({
        type: z.string().describe('The type of the content'),
        text: z.string().describe('The text of the content'),
      })).describe('The content of the tool call result'),
      isError: z.boolean().describe('Whether the tool call is an error'),
    }).describe('The result of the tool call'),
  }),
]

export const mcp = async () => Promise.all(tools)
