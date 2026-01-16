import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { McpCallToolResult, McpContentPart, McpTool } from '../../../shared/electron/mcp'

import { env as processEnv } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { defineInvokeHandler } from '@moeru/eventa'
import { nanoid } from 'nanoid'

import { mcp } from '../../../shared/electron/mcp'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

const log = useLogg('mcp-service').useGlobalConfig()

/**
 * Represents a single MCP server session.
 * Handles operations on a specific MCP server connection (list tools, call tools, etc.)
 */
class McpServerSession {
  constructor(
    public readonly serverId: string,
    private readonly client: Client,
    private readonly transport: StdioClientTransport,
  ) {}

  async listTools(): Promise<McpTool[]> {
    try {
      const response = await this.client.listTools()
      return response.tools.map((tool: { name: string, description?: string, inputSchema: unknown }) => {
        // Runtime validation for inputSchema
        const rawSchema = tool.inputSchema
        const isObject = rawSchema && typeof rawSchema === 'object' && !Array.isArray(rawSchema)

        const validatedSchema: McpTool['inputSchema'] = {
          required: isObject && 'required' in rawSchema && Array.isArray((rawSchema as any).required)
            ? (rawSchema as any).required
            : [],
          title: isObject && 'title' in rawSchema && typeof (rawSchema as any).title === 'string'
            ? (rawSchema as any).title
            : '',
          type: 'object', // Always 'object' for MCP tools
          properties: isObject && 'properties' in rawSchema && typeof (rawSchema as any).properties === 'object' && !Array.isArray((rawSchema as any).properties)
            ? (rawSchema as any).properties
            : {},
        }

        return {
          name: tool.name,
          description: tool.description || '',
          inputSchema: validatedSchema,
        }
      })
    }
    catch (error) {
      log.withError(error as Error).error(`[${this.serverId}] Failed to list tools`)
      throw error
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
    log.log(`[${this.serverId}] Calling tool: ${name} with args: ${JSON.stringify(args)}`)

    try {
      const response = await this.client.callTool({
        name,
        arguments: args,
      })

      // Type assertion: response.content is an array of content parts
      // The MCP SDK returns content as unknown, so we need to assert its type
      const rawContent = response.content as unknown
      const content: Array<{ type: string, [key: string]: unknown }> = Array.isArray(rawContent) ? rawContent : []

      const result: McpCallToolResult = {
        content: content.map((item: { type: string, [key: string]: unknown }): McpContentPart => {
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
          // For other content types, validate structure and preserve it
          // Runtime validation: ensure the item has the basic structure of McpContentPart
          if (item && typeof item === 'object' && 'type' in item && typeof item.type === 'string') {
            return item as McpContentPart
          }
          // Fallback: if validation fails, create a valid text content part
          log.withError(new Error('Invalid content part structure')).warn(`[${this.serverId}] Invalid content part, converting to text`)
          return {
            type: 'text',
            text: JSON.stringify(item),
          }
        }),
        isError: Boolean(response.isError),
      }

      log.log(`[${this.serverId}] Tool call result: ${JSON.stringify(result)}`)
      return result
    }
    catch (error) {
      log.withError(error as Error).error(`[${this.serverId}] Failed to call tool: ${name}`)
      throw error
    }
  }

  async close(): Promise<void> {
    log.log(`[${this.serverId}] Disconnecting from MCP server`)

    try {
      // Using Promise.allSettled ensures both close() calls are attempted,
      // preventing resource leaks if one of them fails.
      const results = await Promise.allSettled([
        this.client.close(),
        this.transport.close(),
      ])

      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (rejected.length > 0) {
        throw new AggregateError(rejected.map(r => r.reason), 'One or more errors occurred during disconnection.')
      }

      log.log(`[${this.serverId}] Successfully disconnected from MCP server`)
    }
    catch (error) {
      log.withError(error as Error).error(`[${this.serverId}] Error disconnecting from MCP server`)
      throw error
    }
  }
}

/**
 * Manages multiple MCP server connections.
 * Handles connection lifecycle (connect, disconnect) and provides access to sessions.
 */
class McpManager {
  private sessions = new Map<string, McpServerSession>()

  async connectServer(command: string, args: string[]): Promise<string> {
    const serverId = nanoid()
    log.log(`[${serverId}] Connecting to MCP server: ${command} ${args.join(' ')}`)

    try {
      // Create stdio transport (it handles process spawning internally)
      const env = Object.fromEntries(
        Object.entries(processEnv).filter(([, value]) => value !== undefined),
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

      const session = new McpServerSession(serverId, client, transport)
      this.sessions.set(serverId, session)

      log.log(`[${serverId}] Successfully connected to MCP server`)
      return serverId
    }
    catch (error) {
      log.withError(error as Error).error(`[${serverId}] Failed to connect to MCP server`)
      throw error
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId)
    if (!session) {
      throw new Error(`MCP server connection not found: ${serverId}`)
    }

    await session.close()
    this.sessions.delete(serverId)
  }

  getSession(serverId: string): McpServerSession {
    const session = this.sessions.get(serverId)
    if (!session) {
      throw new Error(`MCP server connection not found: ${serverId}`)
    }
    return session
  }

  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys())
  }
}

const manager = new McpManager()

export function createMcpService(params: { context: ReturnType<typeof createContext>['context'] }) {
  const { context } = params

  // Cleanup on app quit - disconnect all servers
  onAppBeforeQuit(async () => {
    const serverIds = manager.getAllSessionIds()
    await Promise.allSettled(
      serverIds.map(serverId =>
        manager.disconnectServer(serverId).catch(error =>
          log.withError(error).error(`[${serverId}] Error disconnecting on app quit`),
        ),
      ),
    )
  })

  defineInvokeHandler(context, mcp.connectServer, async (payload) => {
    return await manager.connectServer(payload.command, payload.args)
  })

  defineInvokeHandler(context, mcp.disconnectServer, async (payload) => {
    await manager.disconnectServer(payload.serverId)
  })

  defineInvokeHandler(context, mcp.listTools, async (payload) => {
    const session = manager.getSession(payload.serverId)
    return await session.listTools()
  })

  defineInvokeHandler(context, mcp.callTool, async (payload) => {
    const session = manager.getSession(payload.serverId)
    return await session.callTool(payload.name, payload.args)
  })
}
