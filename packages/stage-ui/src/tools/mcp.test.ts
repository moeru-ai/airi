import type { JsonSchema } from 'xsschema'

import type { McpToolRuntime } from './mcp'

import { describe, expect, it, vi } from 'vitest'

import { createMcpTools, mcp } from './mcp'

function createRuntime(): McpToolRuntime {
  return {
    listTools: vi.fn(async () => []),
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
  }
}

describe('tools mcp schema', () => {
  it('emits strict parameter objects', async () => {
    const tools = await Promise.all(createMcpTools(createRuntime()))
    for (const name of ['builtIn_mcpListTools', 'builtIn_mcpCallTool']) {
      const t = tools.find(entry => entry.function.name === name)
      expect(t, `missing tool: ${name}`).toBeDefined()
      expect(t?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('builtIn_mcpCallTool uses flat name+arguments schema', async () => {
    const tools = await Promise.all(createMcpTools(createRuntime()))
    const callTool = tools.find(entry => entry.function.name === 'builtIn_mcpCallTool')
    expect(callTool).toBeDefined()

    const props = (callTool!.function.parameters as JsonSchema).properties!
    expect((props.name as JsonSchema).type).toBe('string')
    expect((props.arguments as JsonSchema).type).toBe('string')
  })

  it('describes optional Terminal routing and Host-gated AUV use', async () => {
    const [listTools] = await Promise.all(createMcpTools(createRuntime()))
    expect(listTools.function.description).toContain('do not call Terminal as a preflight')
    expect(listTools.function.description).toContain('Reserve AUV for on-screen visual state or GUI interaction when the Host permits it')
  })
})

describe('mcp discovery', () => {
  it('registers live discovery when the optional index does not respond', async () => {
    vi.useFakeTimers()
    try {
      const runtime = createRuntime()
      vi.mocked(runtime.listTools).mockReturnValueOnce(new Promise(() => {}))
      let registered = false
      const registration = Promise.all(createMcpTools(runtime)).then((tools) => {
        registered = true
        return tools
      })

      await vi.advanceTimersByTimeAsync(1000)

      expect(registered).toBe(true)
      const [listTools] = await registration
      expect(listTools.function.description).toContain('index is unavailable')
      expect(runtime.callTool).not.toHaveBeenCalled()
      expect(await listTools.execute({}, { messages: [], toolCallId: 'list-after-index-deadline' }))
        .toBe('No MCP tools are available. Do not retry discovery during this assistant turn.')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('advertises the connected tool index before the first model choice without dispatching an operation', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockResolvedValue([{
      serverName: 'fixture',
      name: 'fixture::terminal_exec',
      toolName: 'terminal_exec',
      inputSchema: { type: 'object', properties: {} },
    }])

    const [listTools] = await Promise.all(createMcpTools(runtime))

    expect(listTools.function.description).toContain('fixture::terminal_exec')
    expect(runtime.listTools).toHaveBeenCalledTimes(1)
    expect(runtime.callTool).not.toHaveBeenCalled()

    vi.mocked(runtime.listTools).mockResolvedValue([])
    const result = await listTools.execute({}, { messages: [], toolCallId: 'list-current' })

    expect(result).toBe('No MCP tools are available. Do not retry discovery during this assistant turn.')
    expect(runtime.listTools).toHaveBeenCalledTimes(2)
    expect(runtime.callTool).not.toHaveBeenCalled()
  })

  it('keeps live discovery available when the registration index fails', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockRejectedValueOnce(new Error('Catalog transport unavailable.'))
    const [listTools] = await Promise.all(createMcpTools(runtime))

    expect(listTools.function.description).toContain('index is unavailable')
    expect(runtime.callTool).not.toHaveBeenCalled()

    vi.mocked(runtime.listTools).mockResolvedValue([])
    expect(await listTools.execute({}, { messages: [], toolCallId: 'list-recovered' }))
      .toBe('No MCP tools are available. Do not retry discovery during this assistant turn.')
  })

  // https://github.com/moeru-ai/airi/issues/2779
  // ROOT CAUSE:
  //
  // The default tool set exposed proxies backed by an unavailable MCP runtime.
  // We fixed this by leaving proxy registration to runtimes with an MCP transport.
  it('omits proxy tools without an MCP runtime (Issue #2779)', async () => {
    expect(await mcp()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/issues/2779
  // ROOT CAUSE:
  //
  // An empty descriptor array gave the model no terminal discovery result.
  // We fixed this with an explicit message that asks the model to stop discovery.
  it('reports an empty catalog explicitly (Issue #2779)', async () => {
    const runtime = createRuntime()
    const [listTools] = await Promise.all(createMcpTools(runtime))

    const result = await listTools.execute({}, { messages: [], toolCallId: 'list-empty' })

    expect(result).toBe('No MCP tools are available. Do not retry discovery during this assistant turn.')
    expect(runtime.listTools).toHaveBeenCalledTimes(2)
  })

  // https://github.com/moeru-ai/airi/issues/2779
  // ROOT CAUSE:
  //
  // Discovery caught the transport error and returned an empty string.
  // We fixed this with an MCP error result that retains the failure reason.
  it('returns the discovery failure to the model (Issue #2779)', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockRejectedValue(new Error('MCP connection closed.'))
    const [listTools] = await Promise.all(createMcpTools(runtime))

    const result = await listTools.execute({}, { messages: [], toolCallId: 'list-failed' })

    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'MCP tool discovery failed: MCP connection closed.' }],
    })
    expect(runtime.listTools).toHaveBeenCalledTimes(2)
  })

  it('retains available tool descriptors and proxies invocation', async () => {
    const runtime = createRuntime()
    const descriptors = [{
      serverName: 'memory',
      name: 'memory::read_graph',
      toolName: 'read_graph',
      description: 'Read the memory graph.',
      inputSchema: { type: 'object', properties: {} },
    }]
    vi.mocked(runtime.listTools).mockResolvedValue(descriptors)
    const [listTools, callTool] = await Promise.all(createMcpTools(runtime))

    expect(await listTools.execute({}, { messages: [], toolCallId: 'list-success' })).toEqual(descriptors)
    expect(await callTool.execute({ name: 'memory::read_graph', arguments: '{}' }, { messages: [], toolCallId: 'call-success' }))
      .toEqual({ content: [{ type: 'text', text: 'ok' }] })
    expect(runtime.callTool).toHaveBeenCalledWith({ name: 'memory::read_graph', arguments: {} }, expect.objectContaining({ toolCallId: 'call-success' }))
  })

  it('retains invocation failures as MCP error results', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.callTool).mockRejectedValue(new Error('Unknown tool.'))
    const [, callTool] = await Promise.all(createMcpTools(runtime))

    const result = await callTool.execute({ name: 'memory::missing', arguments: '{}' }, { messages: [], toolCallId: 'call-failed' })

    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'Unknown tool.' }] })
  })
})
