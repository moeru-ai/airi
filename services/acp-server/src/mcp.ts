import type { McpServer } from '@agentclientprotocol/sdk'

import { RequestError } from '@agentclientprotocol/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, object>
    required?: string[]
  }
  call: (args: Record<string, unknown>) => Promise<string>
}

export interface McpConnection {
  name: string
  tools: McpToolDefinition[]
  close: () => Promise<void>
}

/** Connects the MCP servers a client attached to a session. ACP transport is rejected. */
export async function connectMcpServers(servers: McpServer[], cwd: string): Promise<McpConnection[]> {
  const connections: McpConnection[] = []
  try {
    for (const server of servers)
      connections.push(await connectOne(server, cwd))
    return connections
  }
  catch (error) {
    await Promise.all(connections.map(connection => connection.close()))
    throw error
  }
}

async function connectOne(server: McpServer, cwd: string): Promise<McpConnection> {
  if ('type' in server && server.type === 'acp')
    throw RequestError.invalidParams({ name: server.name }, 'MCP over ACP is not supported')

  const client = new Client({ name: `airi-acp:${server.name}`, version: '0.0.0' })
  if (!('type' in server)) {
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: Object.fromEntries(server.env.map(item => [item.name, item.value])),
      cwd,
      stderr: 'pipe',
    })
    await client.connect(transport)
  }
  else if (server.type === 'http') {
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers: Object.fromEntries(server.headers.map(item => [item.name, item.value])) },
    }))
  }
  else {
    await client.connect(new SSEClientTransport(new URL(server.url), {
      requestInit: { headers: Object.fromEntries(server.headers.map(item => [item.name, item.value])) },
    }))
  }

  const listed = await client.listTools()
  return {
    name: server.name,
    tools: listed.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      call: async (args) => {
        const result = await client.callTool({ name: tool.name, arguments: args })
        return textFromToolResult(result)
      },
    })),
    close: () => client.close(),
  }
}

function textFromToolResult(result: unknown) {
  if (typeof result !== 'object' || result === null || !('content' in result) || !Array.isArray(result.content))
    return JSON.stringify(result)
  const text = result.content.flatMap((item) => {
    if (typeof item === 'object' && item !== null && 'type' in item && item.type === 'text' && 'text' in item && typeof item.text === 'string')
      return [item.text]
    return []
  }).join('\n')
  return text || JSON.stringify(result.content)
}
