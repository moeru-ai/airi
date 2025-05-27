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
  }),
  tool({
    name: 'mcp_connect_server',
    description: 'Connect to the MCP server. If "success", the connection to the MCP server is successful. Otherwise, the connection fails.',
    execute: async ({ command, args }) => {
      await connectServer(command, args)
      return 'success'
    },
    parameters: z.object({
      command: z.string().describe('The command to connect to the MCP server'),
      args: z.array(z.string()).describe('The arguments to pass to the MCP server'),
    }),
  }),
  tool({
    name: 'mcp_disconnect_server',
    description: 'Disconnect from the MCP server. If "success", the disconnection from the MCP server is successful. Otherwise, the disconnection fails.',
    execute: async () => {
      await disconnectServer()
      return 'success'
    },
    parameters: z.object({}),
  }),
  tool({
    name: 'mcp_call_tool',
    description: 'Call a tool on the MCP server. The result is a list of content and a boolean indicating whether the tool call is an error.',
    execute: async ({ name, parameters }) => {
      const parametersObject = Object.fromEntries(parameters.map(({ name, value }) => [name, value]))
      const result = await callTool(name, parametersObject)
      return result satisfies {
        content: {
          type: string
          text: string
        }[]
        isError: boolean
      }
    },
    parameters: z.object({
      name: z.string().describe('The name of the tool to call'),
      parameters: z.array(z.object({
        name: z.string().describe('The name of the parameter'),
        value: z.union([z.string(), z.number(), z.boolean(), z.object({})]).describe('The value of the parameter, it can be a string, a number, a boolean, or an object'),
      })).describe('The parameters to pass to the tool'),
    }),
  }),
]

export const mcp = async () => Promise.all(tools)
