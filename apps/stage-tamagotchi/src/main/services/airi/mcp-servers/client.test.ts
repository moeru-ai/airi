import type { ListToolsRequest, Tool } from '@modelcontextprotocol/sdk/types.js'

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { expect, it, vi } from 'vitest'

import { McpClient } from './client'

it('validates results for tools on every page of an MCP catalog', async () => {
  const tool = (name: string): Tool => ({
    name,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
  })
  const server = new Server({ name: 'paged-fixture', version: '1' }, { capabilities: { tools: {} } })
  const list = vi.fn(async ({ params }: ListToolsRequest) => params?.cursor === 'page-two'
    ? { tools: [tool('second')] }
    : { tools: [tool('first')], nextCursor: 'page-two' })
  server.setRequestHandler(ListToolsRequestSchema, list)
  server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [], structuredContent: { value: 42 } }))
  const client = new McpClient({ name: 'client-fixture', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const catalog = await client.listTools()
    expect(catalog.tools.map(tool => tool.name)).toEqual(['first', 'second'])
    expect(list.mock.calls.map(([request]) => request.params?.cursor)).toEqual([undefined, 'page-two'])
    await expect(client.callTool({ name: 'first' })).rejects.toThrow('does not match the tool')
    await expect(client.callTool({ name: 'second' })).rejects.toThrow('does not match the tool')
  }
  finally {
    await client.close()
    await server.close()
  }
})
