import { tool } from '@xsai/tool'
import { z } from 'zod'

import { getMcpToolBridge } from '../stores/mcp-tool-bridge'

const tools = [
  tool({
    name: 'builtIn_mcpListTools',
    description: 'List all available MCP tools only when the request truly needs external capabilities, fresh data, or an action outside the model. Do not call this for greetings, small talk, translation, rewriting, summarization, or reasoning-only replies. Call this first to discover tool names before calling builtIn_mcpCallTool.',
    execute: async () => {
      try {
        return await getMcpToolBridge().listTools()
      }
      catch (error) {
        console.warn('[builtIn_mcpListTools] failed to list tools:', error)
        return ''
      }
    },
    parameters: z.object({}).strict(),
  }),
  tool({
    name: 'builtIn_mcpCallTool',
    description: 'Call an MCP tool by name only after deciding a tool is actually necessary for the request. Do not call this for ordinary conversation or tasks answerable from the current chat context. Use builtIn_mcpListTools first to get available tool names.',
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
