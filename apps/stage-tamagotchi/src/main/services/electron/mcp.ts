import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { McpCallToolResult, McpTool } from '../../../shared/electron/mcp'

import { useLogg } from '@guiiai/logg'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { defineInvokeHandler } from '@moeru/eventa'

import { mcp } from '../../../shared/electron/mcp'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

const log = useLogg('mcp-service').useGlobalConfig()

interface McpState {
  client: Client | null
  transport: StdioClientTransport | null
}

const state: McpState = {
  client: null,
  transport: null,
}

async function connectServer(command: string, args: string[]): Promise<void> {
  if (state.client !== null || state.transport !== null) {
    throw new Error('Client already connected')
  }

  log.log(`Connecting to MCP server: ${command} ${args.join(' ')}`)

  try {
    // Create stdio transport (it handles process spawning internally)
    const env: Record<string, string> = {}
    for (const key in process.env) {
      const value = process.env[key]
      if (value !== undefined) {
        env[key] = value
      }
    }

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

    state.client = client
    state.transport = transport

    log.log('Successfully connected to MCP server')
  }
  catch (error) {
    log.withError(error as Error).error('Failed to connect to MCP server')
    state.transport = null
    state.client = null
    throw error
  }
}

async function disconnectServer(): Promise<void> {
  if (state.client === null && state.transport === null) {
    throw new Error('Client not connected')
  }

  log.log('Disconnecting from MCP server')

  try {
    if (state.client) {
      await state.client.close()
      state.client = null
    }

    if (state.transport) {
      await state.transport.close()
      state.transport = null
    }

    log.log('Successfully disconnected from MCP server')
  }
  catch (error) {
    log.withError(error as Error).error('Error disconnecting from MCP server')
    state.transport = null
    state.client = null
    throw error
  }
}

async function listTools(): Promise<McpTool[]> {
  if (state.client === null) {
    throw new Error('Client not connected')
  }

  try {
    const response = await state.client.listTools()
    return response.tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema as McpTool['inputSchema'],
    }))
  }
  catch (error) {
    log.withError(error as Error).error('Failed to list tools')
    throw error
  }
}

async function callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
  if (state.client === null) {
    throw new Error('Client not connected')
  }

  log.log(`Calling tool: ${name} with args: ${JSON.stringify(args)}`)

  try {
    const response = await state.client.callTool({
      name,
      arguments: args,
    })

    const result: McpCallToolResult = {
      content: (response.content as Array<{ type: string, text?: string }>).map(item => ({
        type: item.type,
        text: item.type === 'text' && item.text ? item.text : JSON.stringify(item),
      })),
      isError: Boolean(response.isError),
    }

    log.log(`Tool call result: ${JSON.stringify(result)}`)
    return result
  }
  catch (error) {
    log.withError(error as Error).error(`Failed to call tool: ${name}`)
    throw error
  }
}

export function createMcpService(params: { context: ReturnType<typeof createContext>['context'] }) {
  const { context } = params

  // Cleanup on app quit
  onAppBeforeQuit(async () => {
    if (state.client !== null || state.transport !== null) {
      await disconnectServer().catch(error => log.withError(error).error('Error disconnecting on app quit'))
    }
  })

  defineInvokeHandler(context, mcp.connectServer, async (payload) => {
    await connectServer(payload.command, payload.args)
  })

  defineInvokeHandler(context, mcp.disconnectServer, async () => {
    await disconnectServer()
  })

  defineInvokeHandler(context, mcp.listTools, async () => {
    return await listTools()
  })

  defineInvokeHandler(context, mcp.callTool, async (payload) => {
    return await callTool(payload.name, payload.args)
  })
}
