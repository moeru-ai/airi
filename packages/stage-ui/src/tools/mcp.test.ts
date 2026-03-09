import type { JsonSchema } from 'xsschema'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearMcpToolBridge, notifyMcpToolsChanged, onMcpToolsChanged, setMcpToolBridge } from '../stores/mcp-tool-bridge'
import { getCachedMcpToolList, mcp, resetMcpToolListCache } from './mcp'
import { formatMcpObservationUserContent, tightTextOnlyMcpPromptContentOptions } from './mcp-prompt-content'

describe('tools mcp schema', () => {
  beforeEach(() => {
    clearMcpToolBridge()
    resetMcpToolListCache()
  })

  afterEach(() => {
    clearMcpToolBridge()
    resetMcpToolListCache()
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

  it('mcp_list_tools formats bridge tools and falls back to a text error summary', async () => {
    const listTools = vi.fn()
      .mockResolvedValueOnce([
        {
          serverName: 'demo',
          name: 'demo::tools-list',
          toolName: 'tools-list',
          inputSchema: { type: 'object' },
        },
      ])
      // NOTICE: mcp() now pre-fetches the tool list via refreshToolListCache(),
      // consuming one extra call before the test's execute() calls.
      .mockResolvedValueOnce([
        {
          serverName: 'demo',
          name: 'demo::tools-list',
          toolName: 'tools-list',
          inputSchema: { type: 'object' },
        },
      ])
      .mockRejectedValueOnce(new Error('boom'))

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
        type: 'text',
        text: 'Available MCP tools:\n- demo::tools-list(): No description provided.',
      },
    ])
    expect(second).toEqual([
      {
        type: 'text',
        text: 'MCP tool call failed: boom',
      },
    ])
    // +1 for the refreshToolListCache() pre-fetch in mcp()
    expect(listTools).toHaveBeenCalledTimes(3)
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
    expect(first).toEqual([
      { type: 'text', text: 'ok' },
    ])
    expect(second).toEqual([
      {
        type: 'text',
        text: 'MCP tool call failed: tool failed',
      },
    ])
  })

  it('mcp_call_tool rewrites MCP image content to image_url content parts', async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'image',
          data: 'ZmFrZQ==',
          mimeType: 'image/png',
        },
      ],
      isError: false,
    })

    setMcpToolBridge({
      listTools: vi.fn().mockResolvedValue([]),
      callTool,
    })

    const tools = await mcp()
    const call = tools.find(entry => entry.function.name === 'mcp_call_tool')

    const result = await call!.execute({
      name: 'demo::image',
      parameters: [],
    }, undefined as never)

    expect(result).toEqual([
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,ZmFrZQ==',
        },
      },
    ])
  })

  it('mcp_call_tool omits oversized inline images in non-browser tests', async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'image',
          data: 'a'.repeat(20_000),
          mimeType: 'image/png',
        },
      ],
      isError: false,
    })

    setMcpToolBridge({
      listTools: vi.fn().mockResolvedValue([]),
      callTool,
    })

    const tools = await mcp({ promptContentMode: 'tight' })
    const call = tools.find(entry => entry.function.name === 'mcp_call_tool')

    const result = await call!.execute({
      name: 'demo::image',
      parameters: [],
    }, undefined as never)

    expect(result).toEqual([
      {
        type: 'text',
        text: 'MCP tool returned an image (image/png), but the inline image payload was omitted to stay within the model request budget.',
      },
    ])
  })

  it('mcp_call_tool can force text-only summaries for providers that reject inline tool images', async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'image',
          data: 'ZmFrZQ==',
          mimeType: 'image/png',
        },
      ],
      isError: false,
    })

    setMcpToolBridge({
      listTools: vi.fn().mockResolvedValue([]),
      callTool,
    })

    const tools = await mcp({ promptContentMode: 'tight-text-only' })
    const call = tools.find(entry => entry.function.name === 'mcp_call_tool')

    const result = await call!.execute({
      name: 'demo::image',
      parameters: [],
    }, undefined as never)

    expect(result).toEqual([
      {
        type: 'text',
        text: 'MCP tool returned an image (image/png), but AIRI kept only a textual summary because this provider does not safely support inline images in tool-result messages.',
      },
    ])
  })

  it('builds a separate observation message from screenshot public URLs for tight-text-only providers', async () => {
    const content = await formatMcpObservationUserContent({
      structuredContent: {
        screenshot: {
          publicUrl: 'http://20.196.212.37:8765/observations/vm-local-1/step-7.png',
          observationRef: 'screenshot:step-7.png',
        },
      },
      content: [
        {
          type: 'text',
          text: 'Screenshot captured (320x180) on remote sandbox.',
        },
      ],
    }, tightTextOnlyMcpPromptContentOptions, {
      toolName: 'computer_use::desktop_screenshot',
    })

    expect(content).toEqual([
      {
        type: 'text',
        text: 'New visual observation from computer_use::desktop_screenshot. Screenshot captured (320x180) on remote sandbox.',
      },
      {
        type: 'image_url',
        image_url: {
          url: 'http://20.196.212.37:8765/observations/vm-local-1/step-7.png',
        },
      },
    ])
  })

  it('does not fall back to inline data URLs for tight-text-only observation messages', async () => {
    const content = await formatMcpObservationUserContent({
      content: [
        {
          type: 'text',
          text: 'Screenshot captured (320x180) on remote sandbox.',
        },
        {
          type: 'image',
          data: 'ZmFrZQ==',
          mimeType: 'image/png',
        },
      ],
    }, tightTextOnlyMcpPromptContentOptions, {
      toolName: 'computer_use::desktop_screenshot',
    })

    expect(content).toEqual([])
  })

  describe('tool list hot-refresh', () => {
    it('pre-fetches and caches the tool list when mcp() is called', async () => {
      const tools = [
        { serverName: 'cu', name: 'cu::terminal_exec', toolName: 'terminal_exec', inputSchema: { type: 'object' } },
      ]
      const listTools = vi.fn().mockResolvedValue(tools)
      setMcpToolBridge({ listTools, callTool: vi.fn() })

      await mcp()

      // refreshToolListCache is called inside mcp(), so cache should be populated
      expect(getCachedMcpToolList()).toEqual(tools)
      // listTools is called once for the pre-fetch
      expect(listTools).toHaveBeenCalled()
    })

    it('embeds current tool names in mcp_call_tool description', async () => {
      const tools = [
        { serverName: 'cu', name: 'cu::terminal_exec', toolName: 'terminal_exec', inputSchema: { type: 'object' } },
        { serverName: 'cu', name: 'cu::desktop_screenshot', toolName: 'desktop_screenshot', inputSchema: { type: 'object' } },
      ]
      setMcpToolBridge({
        listTools: vi.fn().mockResolvedValue(tools),
        callTool: vi.fn(),
      })

      const result = await mcp()
      const callTool = result.find(t => t.function.name === 'mcp_call_tool')

      expect(callTool).toBeDefined()
      expect(callTool!.function.description).toContain('cu::terminal_exec')
      expect(callTool!.function.description).toContain('cu::desktop_screenshot')
    })

    it('falls back to generic description when no tools are cached', async () => {
      // No bridge set — refreshToolListCache should silently skip
      const result = await mcp()
      const callTool = result.find(t => t.function.name === 'mcp_call_tool')

      expect(callTool).toBeDefined()
      expect(callTool!.function.description).toContain('Call mcp_list_tools first')
    })

    it('refreshes cache when notifyMcpToolsChanged fires', async () => {
      const initialTools = [
        { serverName: 'cu', name: 'cu::terminal_exec', toolName: 'terminal_exec', inputSchema: { type: 'object' } },
      ]
      const updatedTools = [
        ...initialTools,
        { serverName: 'cu', name: 'cu::workflow_run_tests', toolName: 'workflow_run_tests', inputSchema: { type: 'object' } },
      ]

      let callCount = 0
      const listTools = vi.fn().mockImplementation(async () => {
        callCount++
        return callCount <= 1 ? initialTools : updatedTools
      })
      setMcpToolBridge({ listTools, callTool: vi.fn() })

      // First call populates cache
      await mcp()
      expect(getCachedMcpToolList()).toEqual(initialTools)

      // Verify notifyMcpToolsChanged fires registered callbacks
      let callbackFired = false
      const unsub = onMcpToolsChanged(() => {
        callbackFired = true
      })
      notifyMcpToolsChanged()
      expect(callbackFired).toBe(true)
      unsub()

      // NOTICE: The module-level auto-refresh callback in mcp.ts was cleared
      // by beforeEach → clearMcpToolBridge(). In production this callback
      // persists for the lifetime of the module. Verify the cache still gets
      // updated on the next mcp() call (which always calls refreshToolListCache).
      await mcp()
      expect(getCachedMcpToolList()).toEqual(updatedTools)
      expect(listTools).toHaveBeenCalledTimes(2)
    })
  })
})
