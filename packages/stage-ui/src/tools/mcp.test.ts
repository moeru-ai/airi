import type { JsonSchema } from 'xsschema'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearMcpToolBridge, setMcpToolBridge } from '../stores/mcp-tool-bridge'
import { mcp } from './mcp'

describe('tools mcp schema', () => {
  beforeEach(() => {
    clearMcpToolBridge()
  })

  afterEach(() => {
    clearMcpToolBridge()
    vi.restoreAllMocks()
  })

  it('emits strict parameter objects', async () => {
    const tools = await mcp()
    const toolNames = [
      'mcp_list_tools',
      'mcp_call_tool',
    ]

    for (const name of toolNames) {
      const tool = tools.find(entry => entry.function.name === name)
      expect(tool, `missing tool: ${name}`).toBeDefined()
      expect(tool?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('keeps mcp_call_tool parameters items strict', async () => {
    const tools = await mcp()
    const callTool = tools.find(entry => entry.function.name === 'mcp_call_tool')

    expect(callTool).toBeDefined()
    const items = ((callTool!.function.parameters as JsonSchema).properties?.parameters as JsonSchema)?.items as JsonSchema
    expect(items).toBeDefined()
    expect(items.additionalProperties).toBe(false)
  })

  it('keeps mcp_call_tool parameter value schema explicit for remote providers', async () => {
    const tools = await mcp()
    const callTool = tools.find(entry => entry.function.name === 'mcp_call_tool')

    expect(callTool).toBeDefined()
    const items = ((callTool!.function.parameters as JsonSchema).properties?.parameters as JsonSchema)?.items as JsonSchema
    const valueSchema = items.properties?.value as JsonSchema

    expect(valueSchema).toBeDefined()
    expect(Array.isArray(valueSchema.anyOf)).toBe(true)
    expect((valueSchema.anyOf || []).length).toBeGreaterThan(0)
  })

  it('mcp_list_tools returns bridge tools and falls back to empty array on error', async () => {
    const listTools = vi.fn().mockResolvedValueOnce([
      {
        serverName: 'demo',
        name: 'demo::tools-list',
        toolName: 'tools-list',
        inputSchema: { type: 'object' },
      },
    ]).mockRejectedValueOnce(new Error('boom'))

    const callTool = vi.fn()
    setMcpToolBridge({ listTools, callTool })

    const tools = await mcp()
    const list = tools.find(entry => entry.function.name === 'mcp_list_tools')
    expect(list).toBeDefined()

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = await list!.execute({}, undefined as never)
    const second = await list!.execute({}, undefined as never)

    expect(first).toEqual([
      {
        serverName: 'demo',
        name: 'demo::tools-list',
        toolName: 'tools-list',
        inputSchema: { type: 'object' },
      },
    ])
    expect(second).toEqual([])
    expect(listTools).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalled()
  })

  it('mcp_call_tool maps parameters and returns fallback error payload', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const callTool = vi.fn()
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      })
      .mockRejectedValueOnce(new Error('tool failed'))
    const listTools = vi.fn().mockResolvedValue([])

    setMcpToolBridge({ listTools, callTool })

    const tools = await mcp()
    const call = tools.find(entry => entry.function.name === 'mcp_call_tool')
    expect(call).toBeDefined()

    const first = await call!.execute({
      name: 'demo::echo',
      parameters: [
        { name: 'message', value: 'hello' },
        { name: 'count', value: 2 },
      ],
    }, {
      toolCallId: 'tool-call-1',
      messages: [],
    } as never)

    const second = await call!.execute({
      name: 'demo::echo',
      parameters: [
        { name: 'message', value: 'hello' },
      ],
    }, undefined as never)

    expect(callTool).toHaveBeenNthCalledWith(1, {
      name: 'demo::echo',
      arguments: {
        message: 'hello',
        count: 2,
      },
      requestId: 'tool-call-1',
    })
    expect(first).toEqual({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    })
    expect(second).toEqual({
      isError: true,
      content: [
        {
          type: 'text',
          text: 'tool failed',
        },
      ],
    })
  })
})
