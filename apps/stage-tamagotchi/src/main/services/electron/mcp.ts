import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { Client } from '@modelcontextprotocol/sdk/client'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js'
import { defineInvokeHandler } from '@moeru/eventa'

import { electron } from '../../../shared/electron'

export interface McpClientOptions {
  id: string
  url?: string
  command?: string
  method: string
  args: string[]
}

export interface McpCallToolOptions {
  id: string
  method: string
  args: Record<string, unknown>
}

export function createMcpService(params: { context: ReturnType<typeof createContext>['context'] }) {
  const clients = new Map<string, Client>()

  function createAndRunMcpClient(options: McpClientOptions) {
    if (clients.has(options.id)) {
      return
    }

    const client = new Client({
      name: 'stage-tamagotchi',
      version: '1.0.0',
    })

    if (options.command) {
      client.connect(new StdioClientTransport({ command: options.command, args: options.args }))
      return
    }

    if (options.url) {
      client.connect(new WebSocketClientTransport(new URL(options.url)))
      return
    }

    throw new Error('No transport specified')
  }

  function callTool(options: McpCallToolOptions) {
    const client = clients.get(options.id)
    if (!client) {
      throw new Error('Client not found')
    }
    return client.callTool({ name: options.method, arguments: options.args })
  }

  defineInvokeHandler(params.context, electron.mcp.createAndRunClient, options => createAndRunMcpClient(options))
  defineInvokeHandler(params.context, electron.mcp.callTool, options => callTool(options))
}
