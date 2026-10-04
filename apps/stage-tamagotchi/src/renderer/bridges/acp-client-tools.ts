import type { AcpBridgeCapabilities, AcpBridgeToolCall } from '@proj-airi/acp-server/bridge'
import type { Tool } from '@xsai/shared-chat'

import { tool } from '@xsai/tool'
import { z } from 'zod'

/** Builds the ACP Client tools for one connected chat session. */
export function createAcpClientTools(input: {
  capabilities: AcpBridgeCapabilities
  hasMcp: boolean
  call: (call: AcpBridgeToolCall) => Promise<string>
}): Array<Promise<Tool>> {
  const tools: Array<Promise<Tool>> = []
  if (input.capabilities.readTextFile) {
    tools.push(tool({
      name: 'acp_read_text_file',
      description: 'Read a text file through the ACP Client.',
      parameters: z.object({
        path: z.string().describe('Absolute file path'),
        line: z.number().int().optional().describe('1-based start line'),
        limit: z.number().int().optional().describe('Maximum line count'),
      }).strict(),
      execute: async args => input.call({ name: 'read_text_file', arguments: args }),
    }))
  }
  if (input.capabilities.writeTextFile) {
    tools.push(tool({
      name: 'acp_write_text_file',
      description: 'Write a text file through the ACP Client.',
      parameters: z.object({
        path: z.string().describe('Absolute file path'),
        content: z.string().describe('File contents'),
      }).strict(),
      execute: async args => input.call({ name: 'write_text_file', arguments: args }),
    }))
  }
  if (input.capabilities.terminal) {
    tools.push(tool({
      name: 'acp_terminal',
      description: 'Run a command in an ACP Client terminal.',
      parameters: z.object({
        command: z.string().describe('Executable'),
        args: z.array(z.string()).optional().describe('Arguments'),
      }).strict(),
      execute: async args => input.call({ name: 'terminal', arguments: args }),
    }))
  }
  if (input.hasMcp) {
    tools.push(tool({
      name: 'acp_mcp_list_tools',
      description: 'List MCP tools attached by the ACP Client. Names use server::tool.',
      parameters: z.object({}).strict(),
      execute: async () => input.call({ name: 'mcp_list_tools', arguments: {} }),
    }))
    tools.push(tool({
      name: 'acp_mcp_call_tool',
      description: 'Call an ACP Client MCP tool. Use acp_mcp_list_tools to get the name.',
      parameters: z.object({
        name: z.string().describe('Tool name in server::tool form'),
        arguments: z.string().describe('JSON object of tool arguments'),
      }).strict(),
      execute: async args => input.call({
        name: 'mcp_call_tool',
        arguments: { name: args.name, arguments: args.arguments },
      }),
    }))
  }
  return tools
}
