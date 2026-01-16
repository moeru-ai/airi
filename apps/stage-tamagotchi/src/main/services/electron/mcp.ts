import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { McpCallToolResult, McpContentPart, McpTool } from '../../../shared/electron/mcp'

import { useLogg } from '@guiiai/logg'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { defineInvokeHandler } from '@moeru/eventa'

import { mcp } from '../../../shared/electron/mcp'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

const log = useLogg('mcp-service').useGlobalConfig()

interface McpServerConnection {
  client: Client
  transport: StdioClientTransport
}

const connections = new Map<string, McpServerConnection>()

function generateServerId(): string {
  return Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15)
}

async function connectServer(command: string, args: string[]): Promise<string> {
  const serverId = generateServerId()
  log.log(`[${serverId}] Connecting to MCP server: ${command} ${args.join(' ')}`)

  try {
    // Create stdio transport (it handles process spawning internally)
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== undefined),
    ) as Record<string, string>

    const transport = new StdioClientTransport({
      command,
      args,
      env,
    })

    // Create MCP client
    const client = new Client({
      name: 'airi-electron',
      version: '1.0.0',
    }, {
      capabilities: {},
    })

    // Connect the client
    await client.connect(transport)

    connections.set(serverId, { client, transport })

    log.log(`[${serverId}] Successfully connected to MCP server`)
    return serverId
  }
  catch (error) {
    log.withError(error as Error).error(`[${serverId}] Failed to connect to MCP server`)
    throw error
  }
}

async function disconnectServer(serverId: string): Promise<void> {
  const connection = connections.get(serverId)
  if (!connection) {
    throw new Error(`MCP server connection not found: ${serverId}`)
  }

  log.log(`[${serverId}] Disconnecting from MCP server`)

  try {
    // Using Promise.allSettled ensures both close() calls are attempted,
    // preventing resource leaks if one of them fails.
    const results = await Promise.allSettled([
      connection.client.close(),
      connection.transport.close(),
    ])

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (rejected.length > 0) {
      throw new AggregateError(rejected.map(r => r.reason), 'One or more errors occurred during disconnection.')
    }

    log.log(`[${serverId}] Successfully disconnected from MCP server`)
  }
  catch (error) {
    log.withError(error as Error).error(`[${serverId}] Error disconnecting from MCP server`)
    throw error
  }
  finally {
    // Remove connection regardless of success or failure.
    connections.delete(serverId)
  }
}

async function listTools(serverId: string): Promise<McpTool[]> {
  const connection = connections.get(serverId)
  if (!connection) {
    throw new Error(`MCP server connection not found: ${serverId}`)
  }

  try {
    const response = await connection.client.listTools()
    return response.tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema as McpTool['inputSchema'],
    }))
  }
  catch (error) {
    log.withError(error as Error).error(`[${serverId}] Failed to list tools`)
    throw error
  }
}

async function callTool(serverId: string, name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
  const connection = connections.get(serverId)
  if (!connection) {
    throw new Error(`MCP server connection not found: ${serverId}`)
  }

  log.log(`[${serverId}] Calling tool: ${name} with args: ${JSON.stringify(args)}`)

  try {
    const response = await connection.client.callTool({
      name,
      arguments: args,
    })

    const result: McpCallToolResult = {
      content: response.content.map((item): McpContentPart => {
        if (item.type === 'text' && 'text' in item && typeof item.text === 'string') {
          return { type: 'text', text: item.text }
        }
        if (item.type === 'image' && 'data' in item && typeof item.data === 'string') {
          return {
            type: 'image',
            data: item.data,
            ...('mimeType' in item && typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : {}),
          }
        }
        // For other content types, preserve the structure
        return item as McpContentPart
      }),
      isError: Boolean(response.isError),
    }

    log.log(`[${serverId}] Tool call result: ${JSON.stringify(result)}`)
    return result
  }
  catch (error) {
    log.withError(error as Error).error(`[${serverId}] Failed to call tool: ${name}`)
    throw error
  }
}

export function createMcpService(params: { context: ReturnType<typeof createContext>['context'] }) {
  const { context } = params

  // Cleanup on app quit - disconnect all servers
  onAppBeforeQuit(async () => {
    const serverIds = Array.from(connections.keys())
    await Promise.allSettled(
      serverIds.map(serverId =>
        disconnectServer(serverId).catch(error =>
          log.withError(error).error(`[${serverId}] Error disconnecting on app quit`),
        ),
      ),
    )
  })

  defineInvokeHandler(context, mcp.connectServer, async (payload) => {
    return await connectServer(payload.command, payload.args)
  })

  defineInvokeHandler(context, mcp.disconnectServer, async (payload) => {
    await disconnectServer(payload.serverId)
  })

  defineInvokeHandler(context, mcp.listTools, async (payload) => {
    return await listTools(payload.serverId)
  })

  defineInvokeHandler(context, mcp.callTool, async (payload) => {
    return await callTool(payload.serverId, payload.name, payload.args)
  })
}
